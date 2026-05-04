import { createServiceClient } from '@/lib/supabase/server'
import {
  findOrCreateConversation,
  isAgentPaused,
  getAgentConfig,
  getRecentMessages,
  saveMessage,
  updateMessageTranscription,
  updateConversationTimestamp,
  logAiUsage,
} from '@/lib/supabase/queries/conversations'
import { openAIChatCompletion } from './openai'
import { anthropicChatCompletion } from './anthropic'
import { transcribeAudio, interpretImage } from './openai'
import { generateEmbedding } from './embeddings'
import { sendTextMessage, downloadMediaAsBase64 } from '@/lib/evolution/client'
import type { EvolutionMessageKey, WhatsAppMessageType } from '@/lib/evolution/webhook'
import type { ChatMessage } from './openai'

// Dia da semana em pt-BR para comparar com dias_funcionamento
const DIAS_PT: Record<number, string> = {
  0: 'dom',
  1: 'seg',
  2: 'ter',
  3: 'qua',
  4: 'qui',
  5: 'sex',
  6: 'sab',
}

// Custo aproximado em BRL por 1k tokens (referência mai/2025)
const CUSTO_POR_1K: Record<string, { entrada: number; saida: number }> = {
  openai: { entrada: 0.025, saida: 0.1 },
  anthropic: { entrada: 0.015, saida: 0.075 },
}

function calcularCusto(motor: string, tokensIn: number, tokensOut: number): number {
  const tabela = CUSTO_POR_1K[motor] ?? CUSTO_POR_1K.openai
  return (tokensIn / 1000) * tabela.entrada + (tokensOut / 1000) * tabela.saida
}

function isWithinOperatingHours(
  horarioInicio: string,
  horarioFim: string,
  diasFuncionamento: string[]
): boolean {
  const agora = new Date()
  const diaSemana = DIAS_PT[agora.getDay()]
  if (!diasFuncionamento.includes(diaSemana)) return false

  const [hI, mI] = horarioInicio.split(':').map(Number)
  const [hF, mF] = horarioFim.split(':').map(Number)
  const minutoAtual = agora.getHours() * 60 + agora.getMinutes()

  return minutoAtual >= hI * 60 + mI && minutoAtual <= hF * 60 + mF
}

function buildSystemPrompt(
  promptPrincipal: string,
  knowledgeDocs: Array<{ conteudo_texto: string }>
): string {
  let prompt =
    promptPrincipal ||
    'Você é um assistente de atendimento ao cliente prestativo e cordial.'

  if (knowledgeDocs.length > 0) {
    prompt += '\n\nBase de conhecimento relevante:\n'
    prompt += knowledgeDocs.map(d => d.conteudo_texto).join('\n---\n')
  }

  prompt +=
    '\n\nResponda sempre em português brasileiro. Seja direto e objetivo. Se não souber a resposta, informe que vai verificar.'

  return prompt
}

export interface ProcessMessagePayload {
  tenantId: string
  instanceName: string
  phone: string
  pushName?: string
  messageId: string
  messageKey: EvolutionMessageKey
  messageType: WhatsAppMessageType
  conteudo?: string
  caption?: string
}

export async function processIncomingMessage(
  payload: ProcessMessagePayload
): Promise<void> {
  const supabase = createServiceClient()

  // 1. Encontra ou cria conversa ativa para este contato
  const conversa = await findOrCreateConversation(
    supabase,
    payload.tenantId,
    payload.phone,
    payload.pushName
  )

  // 2. Agente pausado → silêncio total, operador humano assumiu
  const pausado = await isAgentPaused(supabase, conversa.id)
  if (pausado) return

  // 3. Configuração do agente para este tenant
  const config = await getAgentConfig(supabase, payload.tenantId)
  if (!config || !config.ativo) return

  // 4. Fora do horário → envia mensagem de ausência e encerra
  const dentroDoHorario = isWithinOperatingHours(
    config.horario_inicio,
    config.horario_fim,
    config.dias_funcionamento
  )
  if (!dentroDoHorario) {
    await sendTextMessage(payload.instanceName, payload.phone, config.mensagem_ausencia)
    return
  }

  // 5. Persiste a mensagem do cliente no banco
  let tipoDb = 'texto'
  if (payload.messageType === 'audioMessage') tipoDb = 'audio'
  else if (payload.messageType === 'imageMessage') tipoDb = 'imagem'
  else if (payload.messageType === 'videoMessage') tipoDb = 'video'
  else if (payload.messageType === 'documentMessage') tipoDb = 'documento'

  const mensagemSalva = await saveMessage(supabase, {
    conversationId: conversa.id,
    tenantId: payload.tenantId,
    origem: 'cliente',
    tipo: tipoDb,
    conteudo: payload.conteudo,
    metadata: { messageId: payload.messageId, pushName: payload.pushName },
  })

  // 6. Processa mídia e extrai conteúdo textual para o agente
  let conteudoProcessado = payload.conteudo ?? ''

  if (payload.messageType === 'audioMessage') {
    try {
      const { base64, mimetype } = await downloadMediaAsBase64(
        payload.instanceName,
        payload.messageKey
      )
      const transcricao = await transcribeAudio(base64, mimetype)
      await updateMessageTranscription(supabase, mensagemSalva.id, transcricao)
      conteudoProcessado = transcricao
    } catch (err) {
      console.error('[process-message] Falha ao transcrever áudio:', err)
      conteudoProcessado = '[Áudio recebido — não foi possível transcrever]'
    }
  }

  if (payload.messageType === 'imageMessage') {
    try {
      const { base64, mimetype } = await downloadMediaAsBase64(
        payload.instanceName,
        payload.messageKey
      )
      const descricao = await interpretImage(base64, mimetype, payload.caption)
      conteudoProcessado = payload.caption
        ? `${payload.caption}\n[Imagem: ${descricao}]`
        : `[Imagem: ${descricao}]`
    } catch (err) {
      console.error('[process-message] Falha ao interpretar imagem:', err)
      conteudoProcessado = payload.caption || '[Imagem recebida]'
    }
  }

  if (!conteudoProcessado.trim()) return

  // 7. Busca semântica na base de conhecimento do tenant
  let knowledgeDocs: Array<{ conteudo_texto: string; similarity: number }> = []
  try {
    const embedding = await generateEmbedding(conteudoProcessado)
    const { data: docs } = await supabase.rpc('match_knowledge', {
      query_embedding: embedding,
      match_tenant_id: payload.tenantId,
      match_threshold: 0.7,
      match_count: 5,
    })
    knowledgeDocs = (docs ?? []) as Array<{ conteudo_texto: string; similarity: number }>
  } catch (err) {
    console.error('[process-message] Falha na busca semântica:', err)
  }

  // 8. Monta histórico de mensagens como contexto para a IA
  const historico = await getRecentMessages(supabase, conversa.id, 10)
  const chatMessages: ChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(config.prompt_principal ?? '', knowledgeDocs),
    },
    // Exclui a última mensagem do histórico (é a que acabamos de salvar)
    ...historico.slice(0, -1).map(m => ({
      role: (m.origem === 'agente' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.transcricao || m.conteudo || '',
    })),
    { role: 'user', content: conteudoProcessado },
  ]

  // 9. Geração de resposta com failover automático entre motores de IA
  let resultado: { content: string; tokensIn: number; tokensOut: number } | null = null
  let motorUsado = config.motor_ia_principal

  const chatConfig = {
    temperature: Number(config.temperatura),
    maxTokens: config.max_tokens,
  }

  try {
    resultado =
      config.motor_ia_principal === 'openai'
        ? await openAIChatCompletion(chatMessages, chatConfig)
        : await anthropicChatCompletion(chatMessages, chatConfig)
  } catch (errPrimario) {
    console.error(
      `[process-message] Motor primário (${config.motor_ia_principal}) falhou:`,
      errPrimario
    )
    try {
      motorUsado = config.motor_ia_backup
      resultado =
        config.motor_ia_backup === 'anthropic'
          ? await anthropicChatCompletion(chatMessages, chatConfig)
          : await openAIChatCompletion(chatMessages, chatConfig)
    } catch (errBackup) {
      console.error(
        `[process-message] Motor backup (${config.motor_ia_backup}) também falhou:`,
        errBackup
      )
      return
    }
  }

  if (!resultado?.content) return

  // 10. Persiste resposta do agente e envia pelo WhatsApp
  await saveMessage(supabase, {
    conversationId: conversa.id,
    tenantId: payload.tenantId,
    origem: 'agente',
    tipo: 'texto',
    conteudo: resultado.content,
    metadata: { motor: motorUsado },
  })

  await sendTextMessage(payload.instanceName, payload.phone, resultado.content)
  await updateConversationTimestamp(supabase, conversa.id)

  // 11. Registra uso de IA para controle de custos por ciclo
  await logAiUsage(supabase, {
    tenantId: payload.tenantId,
    conversationId: conversa.id,
    tokensIn: resultado.tokensIn,
    tokensOut: resultado.tokensOut,
    motor: motorUsado,
    custoReais: calcularCusto(motorUsado, resultado.tokensIn, resultado.tokensOut),
  })
}
