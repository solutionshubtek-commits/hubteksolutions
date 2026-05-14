import { createServiceClient } from '@/lib/supabase/server'
import {
  reativarOuCriarConversa,
  isAgentPaused,
  isTenantAgentActive,
  getAgentConfig,
  getRecentMessages,
  saveMessage,
  updateMessageTranscription,
  updateConversationTimestamp,
  logAiUsage,
} from '@/lib/supabase/queries/conversations'
import { openAIChatCompletion, openAIChatCompletionWithTools } from './openai'
import { anthropicChatCompletion } from './anthropic'
import { transcribeAudio, interpretImage } from './openai'
import { generateEmbedding } from './embeddings'
import { sendTextMessage, downloadMediaAsBase64 } from '@/lib/evolution/client'
import type { EvolutionMessageKey, WhatsAppMessageType } from '@/lib/evolution/webhook'
import type { ChatMessage } from './openai'
import {
  listAvailableSlots,
  listEventsByDay,
  createEvent,
  rescheduleEvent,
  deleteEvent,
  findEventByName,
  parseDateFromText,
  type GoogleCalendarConfig,
} from '@/lib/google-calendar'

const DIAS_PT: Record<number, string> = {
  0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab',
}

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
  const agoraBrasil = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const diaSemana = DIAS_PT[agoraBrasil.getUTCDay()]
  if (!diasFuncionamento.includes(diaSemana)) return false
  const [hI, mI] = horarioInicio.split(':').map(Number)
  const [hF, mF] = horarioFim.split(':').map(Number)
  const minutoAtual = agoraBrasil.getUTCHours() * 60 + agoraBrasil.getUTCMinutes()
  return minutoAtual >= hI * 60 + mI && minutoAtual <= hF * 60 + mF
}

function buildSystemPrompt(
  promptPrincipal: string,
  knowledgeDocs: Array<{ conteudo_texto: string }>,
  temCalendar: boolean,
  horarioInicio: string,
  horarioFim: string
): string {
  let prompt = promptPrincipal || 'Você é um assistente de atendimento ao cliente prestativo e cordial.'
  if (knowledgeDocs.length > 0) {
    prompt += '\n\nBase de conhecimento relevante:\n'
    prompt += knowledgeDocs.map(d => d.conteudo_texto).join('\n---\n')
  }
  if (temCalendar) {
    prompt += `\n\nVocê tem acesso à agenda da empresa. Horário de atendimento: ${horarioInicio} às ${horarioFim}.`
    prompt += '\nQuando o cliente pedir agendamento: consulte slots disponíveis, confirme data/hora e crie o evento.'
    prompt += '\nQuando pedir reagendamento: localize o evento pelo nome e reagende para o novo horário solicitado.'
    prompt += '\nQuando pedir cancelamento: localize o evento e confirme antes de deletar.'
    prompt += '\nSempre confirme com o cliente após cada ação na agenda.'
  }
  prompt += '\n\nResponda sempre em português brasileiro. Seja direto e objetivo. Se não souber a resposta, informe que vai verificar.'
  return prompt
}

// ─── Tools do Google Calendar ─────────────────────────────────────────────────

const CALENDAR_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'listar_horarios_disponiveis',
      description: 'Lista horários livres na agenda para uma data específica',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data no formato YYYY-MM-DD ou texto como "amanhã", "hoje", "15/06"' },
          duracao_minutos: { type: 'number', description: 'Duração do agendamento em minutos. Padrão: 60' },
        },
        required: ['data'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'criar_agendamento',
      description: 'Cria um novo agendamento na agenda',
      parameters: {
        type: 'object',
        properties: {
          nome_cliente: { type: 'string', description: 'Nome do cliente para o título do evento' },
          data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
          hora_inicio: { type: 'string', description: 'Hora de início no formato HH:MM' },
          hora_fim: { type: 'string', description: 'Hora de fim no formato HH:MM' },
          descricao: { type: 'string', description: 'Descrição ou observações do agendamento' },
        },
        required: ['nome_cliente', 'data', 'hora_inicio', 'hora_fim'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reagendar',
      description: 'Reagenda um evento existente para nova data/hora',
      parameters: {
        type: 'object',
        properties: {
          nome_cliente: { type: 'string', description: 'Nome do cliente para buscar o evento' },
          nova_data: { type: 'string', description: 'Nova data no formato YYYY-MM-DD' },
          nova_hora_inicio: { type: 'string', description: 'Novo horário de início HH:MM' },
          nova_hora_fim: { type: 'string', description: 'Novo horário de fim HH:MM' },
        },
        required: ['nome_cliente', 'nova_data', 'nova_hora_inicio', 'nova_hora_fim'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cancelar_agendamento',
      description: 'Cancela/remove um agendamento existente',
      parameters: {
        type: 'object',
        properties: {
          nome_cliente: { type: 'string', description: 'Nome do cliente para localizar o evento' },
        },
        required: ['nome_cliente'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'ver_agenda_do_dia',
      description: 'Consulta todos os eventos de um dia específico',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data no formato YYYY-MM-DD ou "hoje", "amanhã"' },
        },
        required: ['data'],
      },
    },
  },
]

// ─── Executor de tool calls ───────────────────────────────────────────────────

async function executarToolCall(
  toolName: string,
  args: Record<string, unknown>,
  calendarConfig: GoogleCalendarConfig,
  horarioInicio: string,
  horarioFim: string
): Promise<string> {
  try {
    if (toolName === 'listar_horarios_disponiveis') {
      const dataRaw = String(args.data ?? 'hoje')
      const data = dataRaw.match(/^\d{4}-\d{2}-\d{2}$/) ? dataRaw : parseDateFromText(dataRaw)
      const duracao = Number(args.duracao_minutos ?? 60)
      const slots = await listAvailableSlots(calendarConfig, data, horarioInicio, horarioFim, duracao)
      if (slots.length === 0) return `Não há horários disponíveis para ${data}.`
      const lista = slots.map(s => {
        const d = new Date(s.start)
        const h = String((d.getUTCHours() - 3 + 24) % 24).padStart(2, '0')
        const m = String(d.getUTCMinutes()).padStart(2, '0')
        return `• ${h}:${m}`
      }).join('\n')
      return `Horários disponíveis em ${data}:\n${lista}`
    }

    if (toolName === 'criar_agendamento') {
      const evento = await createEvent(calendarConfig, {
        summary: `Agendamento - ${args.nome_cliente}`,
        start: `${args.data}T${args.hora_inicio}:00-03:00`,
        end: `${args.data}T${args.hora_fim}:00-03:00`,
        description: String(args.descricao ?? ''),
      })
      const d = new Date(evento.start)
      const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
      const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
      return `Agendamento criado com sucesso para ${args.nome_cliente} em ${dataFmt} às ${horaFmt}. ID: ${evento.id}`
    }

    if (toolName === 'reagendar') {
      const evento = await findEventByName(calendarConfig, String(args.nome_cliente))
      if (!evento) return `Não encontrei agendamento para "${args.nome_cliente}" nos próximos 30 dias.`
      const atualizado = await rescheduleEvent(
        calendarConfig,
        evento.id,
        `${args.nova_data}T${args.nova_hora_inicio}:00-03:00`,
        `${args.nova_data}T${args.nova_hora_fim}:00-03:00`
      )
      const d = new Date(atualizado.start)
      const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
      const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
      return `Agendamento de ${args.nome_cliente} reagendado para ${dataFmt} às ${horaFmt}.`
    }

    if (toolName === 'cancelar_agendamento') {
      const evento = await findEventByName(calendarConfig, String(args.nome_cliente))
      if (!evento) return `Não encontrei agendamento para "${args.nome_cliente}" nos próximos 30 dias.`
      await deleteEvent(calendarConfig, evento.id)
      return `Agendamento de ${args.nome_cliente} cancelado com sucesso.`
    }

    if (toolName === 'ver_agenda_do_dia') {
      const dataRaw = String(args.data ?? 'hoje')
      const data = dataRaw.match(/^\d{4}-\d{2}-\d{2}$/) ? dataRaw : parseDateFromText(dataRaw)
      const eventos = await listEventsByDay(calendarConfig, data)
      if (eventos.length === 0) return `Nenhum agendamento para ${data}.`
      const lista = eventos.map(e => {
        const d = new Date(e.start)
        const h = String((d.getUTCHours() - 3 + 24) % 24).padStart(2, '0')
        const m = String(d.getUTCMinutes()).padStart(2, '0')
        return `• ${h}:${m} — ${e.summary}`
      }).join('\n')
      return `Agenda de ${data}:\n${lista}`
    }

    return 'Ação não reconhecida.'
  } catch (err) {
    console.error(`[calendar tool] Erro em ${toolName}:`, err)
    return `Erro ao executar ação na agenda. Tente novamente.`
  }
}

// ─── Payload ──────────────────────────────────────────────────────────────────

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

// ─── processIncomingMessage ───────────────────────────────────────────────────

export async function processIncomingMessage(payload: ProcessMessagePayload): Promise<void> {
  const supabase = createServiceClient()

  // 1. Conversa
  const conversa = await reativarOuCriarConversa(
    supabase,
    payload.tenantId,
    payload.phone,
    payload.pushName,
    payload.instanceName
  )

  // 2. Persiste mensagem do cliente
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

  await updateConversationTimestamp(supabase, conversa.id)

  // 3. Agente global ativo?
  const tenantAtivoGlobal = await isTenantAgentActive(supabase, payload.tenantId)
  if (!tenantAtivoGlobal) return

  // 4. Agente pausado por conversa?
  const pausado = await isAgentPaused(supabase, conversa.id)
  if (pausado) return

  // 5. Config do agente
  const config = await getAgentConfig(supabase, payload.tenantId)
  if (!config || !config.ativo) return

  // 6. Fora do horário
  const dentroDoHorario = isWithinOperatingHours(
    config.horario_inicio,
    config.horario_fim,
    config.dias_funcionamento
  )
  if (!dentroDoHorario) {
    await sendTextMessage(payload.instanceName, payload.phone, config.mensagem_ausencia)
    return
  }

  // 7. Processa mídia
  let conteudoProcessado = payload.conteudo ?? ''

  if (payload.messageType === 'audioMessage') {
    try {
      const { base64, mimetype } = await downloadMediaAsBase64(payload.instanceName, payload.messageKey)
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
      const { base64, mimetype } = await downloadMediaAsBase64(payload.instanceName, payload.messageKey)
      const descricao = await interpretImage(base64, mimetype, payload.caption)
      conteudoProcessado = payload.caption ? `${payload.caption}\n[Imagem: ${descricao}]` : `[Imagem: ${descricao}]`
    } catch (err) {
      console.error('[process-message] Falha ao interpretar imagem:', err)
      conteudoProcessado = payload.caption || '[Imagem recebida]'
    }
  }

  if (!conteudoProcessado.trim()) return

  // 8. Busca semântica
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

  // 9. Histórico
  const historico = await getRecentMessages(supabase, conversa.id, 10)
  const chatMessages: ChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(
        config.prompt_principal ?? '',
        knowledgeDocs,
        !!((config as unknown) as Record<string, unknown>).google_calendar_config,
        config.horario_inicio,
        config.horario_fim
      )
    },
    ...historico.slice(0, -1).map(m => ({
      role: (m.origem === 'agente' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.transcricao || m.conteudo || '',
    })),
    { role: 'user', content: conteudoProcessado },
  ]

  // 10. Verifica se tem Google Calendar configurado e função agendamentos ativa
  const calendarConfig = (((config as unknown) as Record<string, unknown>).google_calendar_config) as GoogleCalendarConfig | null
const funcoesAtivas = (((config as unknown) as Record<string, unknown>).funcoes_ativas as string[]) ?? []
  const usarCalendar = !!(calendarConfig?.client_email && calendarConfig?.private_key && calendarConfig?.calendar_id)
    && funcoesAtivas.includes('agendamentos')

  // 11. Geração de resposta
  let resultado: { content: string; tokensIn: number; tokensOut: number } | null = null
  let motorUsado = config.motor_ia_principal
  const chatConfig = { temperature: Number(config.temperatura), maxTokens: config.max_tokens }

  try {
    if (usarCalendar && config.motor_ia_principal === 'openai') {
      // Usa function calling com tools de calendar
      const respostaComTools = await openAIChatCompletionWithTools(chatMessages, CALENDAR_TOOLS, chatConfig)

      if (respostaComTools.toolCalls && respostaComTools.toolCalls.length > 0) {
        // Executa cada tool call
        const toolResults: ChatMessage[] = []
        for (const tc of respostaComTools.toolCalls) {
          const toolResult = await executarToolCall(
            tc.function.name,
            JSON.parse(tc.function.arguments) as Record<string, unknown>,
            calendarConfig!,
            config.horario_inicio,
            config.horario_fim
          )
          toolResults.push({
            role: 'tool' as const,
            content: toolResult,
            tool_call_id: tc.id,
          } as ChatMessage)
        }

        // Segunda chamada com resultados das tools
        const messagesComTools: ChatMessage[] = [
          ...chatMessages,
          { role: 'assistant', content: '', tool_calls: respostaComTools.toolCalls } as unknown as ChatMessage,
          ...toolResults,
        ]
        resultado = await openAIChatCompletion(messagesComTools, chatConfig)
      } else {
        resultado = { content: respostaComTools.content, tokensIn: respostaComTools.tokensIn, tokensOut: respostaComTools.tokensOut }
      }
    } else {
      // Sem calendar ou motor backup
      resultado = config.motor_ia_principal === 'openai'
        ? await openAIChatCompletion(chatMessages, chatConfig)
        : await anthropicChatCompletion(chatMessages, chatConfig)
    }
  } catch (errPrimario) {
    console.error(`[process-message] Motor primário (${config.motor_ia_principal}) falhou:`, errPrimario)
    try {
      motorUsado = config.motor_ia_backup
      resultado = config.motor_ia_backup === 'anthropic'
        ? await anthropicChatCompletion(chatMessages, chatConfig)
        : await openAIChatCompletion(chatMessages, chatConfig)
    } catch (errBackup) {
      console.error(`[process-message] Motor backup (${config.motor_ia_backup}) também falhou:`, errBackup)
      return
    }
  }

  if (!resultado?.content) return

  // 12. Salva resposta e envia
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

  // 13. Registra uso de IA
  await logAiUsage(supabase, {
    tenantId: payload.tenantId,
    conversationId: conversa.id,
    tokensIn: resultado.tokensIn,
    tokensOut: resultado.tokensOut,
    motor: motorUsado,
    custoReais: calcularCusto(motorUsado, resultado.tokensIn, resultado.tokensOut),
  })
}
