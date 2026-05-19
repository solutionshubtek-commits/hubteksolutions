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
import { detectarMeChama } from './detect-me-chama'

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
  knowledgeDocs: Array<{ conteudo_texto: string; criado_em: string }>,
  temCalendar: boolean,
  temAgendamentosHubtek: boolean,
  horarioInicio: string,
  horarioFim: string
): string {
  let prompt = promptPrincipal || 'Você é um assistente de atendimento ao cliente prestativo e cordial.'

  prompt += `

REGRAS DE COMPORTAMENTO — SIGA RIGOROSAMENTE:

1. FIDELIDADE À BASE DE CONHECIMENTO
   - Para qualquer informação factual (preços, valores, prazos, políticas, horários, endereços, promoções), use EXCLUSIVAMENTE o que estiver nos trechos da base de conhecimento abaixo.
   - NUNCA complete, estime ou invente valores numéricos com base em suposições. Se o valor exato não estiver na base, diga: "Não tenho essa informação no momento, vou verificar para você."
   - Não use conhecimento geral sobre o segmento para preencher lacunas. O que não está na base não existe para você.

2. CONFLITOS ENTRE DOCUMENTOS
   - Se dois trechos trouxerem valores diferentes para a mesma informação, use sempre o trecho de número menor (mais recente).
   - Nunca misture valores de trechos diferentes na mesma resposta.

3. RESPOSTAS
   - Seja direto e objetivo. Responda o que foi perguntado sem enrolação.
   - Não repita a pergunta do cliente na resposta.
   - Não use frases como "Claro!", "Com certeza!", "Ótima pergunta!" — vá direto ao ponto.
   - Finalize com uma pergunta curta de continuidade apenas quando fizer sentido.
   - Nunca invente informações para parecer mais prestativo. Admitir que não sabe é sempre melhor do que errar.

4. LIMITAÇÕES
   - Se a pergunta não tiver resposta na base de conhecimento, responda: "Não tenho essa informação no momento. Para mais detalhes, entre em contato diretamente conosco."
   - Não faça promessas operacionais (ex: "vou resolver agora") a menos que o prompt principal autorize.`

  if (knowledgeDocs.length > 0) {
    prompt += '\n\nBASE DE CONHECIMENTO (do mais recente para o mais antigo — priorize os primeiros em caso de conflito):\n'
    prompt += knowledgeDocs.map((d, i) => `\n[Trecho ${i + 1}]\n${d.conteudo_texto}`).join('\n---')
  } else {
    prompt += '\n\nBase de conhecimento: nenhum documento encontrado para esta consulta. Informe ao cliente que não tem a informação no momento.'
  }

  if (temCalendar) {
    prompt += `\n\nAGENDA: Você tem acesso à agenda da empresa. Horário de atendimento: ${horarioInicio} às ${horarioFim}.`
    prompt += '\nAgendamento: consulte slots disponíveis, confirme data/hora e crie o evento.'
    prompt += '\nReagendamento: localize pelo nome do cliente e reagende.'
    prompt += '\nCancelamento: localize, confirme com o cliente e delete.'
    prompt += '\nSempre confirme com o cliente após cada ação.'
  }

  if (temAgendamentosHubtek) {
    prompt += `\n\nAGENDAMENTOS INTERNOS: Você pode criar, consultar, confirmar e cancelar agendamentos diretamente no sistema.`
    prompt += '\nUse as tools de agendamento para registrar compromissos solicitados pelo cliente.'
    prompt += '\nPara recontatos: use criar_recontato quando o cliente pedir para ser chamado depois.'
    prompt += '\nSempre confirme com o cliente após criar ou alterar um agendamento.'
    prompt += '\nDATAS E HORÁRIOS: sempre use o fuso horário de Brasília (offset -03:00). Exemplo: 20/05/2026 às 10:00 = "2026-05-20T10:00:00-03:00".'
  }

  prompt += '\n\nResponda sempre em português brasileiro.'
  return prompt
}

// ─── Tools do Google Calendar ─────────────────────────────────────────────────

interface ToolFunction {
  name: string
  description: string
  parameters: Record<string, unknown>
}

interface Tool {
  type: 'function'
  function: ToolFunction
}

const CALENDAR_TOOLS: Tool[] = [
  {
    type: 'function',
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
    type: 'function',
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
    type: 'function',
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
    type: 'function',
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
    type: 'function',
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

// ─── Tools de Agendamentos Hubtek ─────────────────────────────────────────────

const APPOINTMENT_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'criar_agendamento_hubtek',
      description: 'Cria um agendamento interno no sistema Hubtek para o cliente',
      parameters: {
        type: 'object',
        properties: {
          contato_nome: { type: 'string', description: 'Nome do cliente' },
          contato_telefone: { type: 'string', description: 'Telefone do cliente com DDI (ex: 5551999999999)' },
          servico: { type: 'string', description: 'Serviço ou motivo do agendamento' },
          data_hora: { type: 'string', description: 'Data e hora no formato ISO 8601. SEMPRE use offset -03:00 (horário de Brasília). Exemplo: para 20/05/2026 às 10:00 use "2026-05-20T10:00:00-03:00"' },
          antecedencia_horas: { type: 'number', description: 'Horas de antecedência para enviar o lembrete. Padrão: 24' },
        },
        required: ['contato_nome', 'contato_telefone', 'servico', 'data_hora'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_agendamentos_cliente',
      description: 'Busca todos os agendamentos de um cliente pelo telefone',
      parameters: {
        type: 'object',
        properties: {
          contato_telefone: { type: 'string', description: 'Telefone do cliente com DDI' },
        },
        required: ['contato_telefone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_agendamento',
      description: 'Confirma um agendamento existente (muda status para confirmado)',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID do agendamento a confirmar' },
        },
        required: ['appointment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_agendamento_hubtek',
      description: 'Cancela um agendamento existente no sistema Hubtek',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID do agendamento a cancelar' },
        },
        required: ['appointment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_recontato',
      description: 'Cria uma tarefa de recontato para ligar/enviar mensagem ao cliente depois',
      parameters: {
        type: 'object',
        properties: {
          contato_nome: { type: 'string', description: 'Nome do cliente' },
          contato_telefone: { type: 'string', description: 'Telefone do cliente com DDI' },
          mensagem_inicial: { type: 'string', description: 'Mensagem a enviar no recontato' },
          agendado_para: { type: 'string', description: 'Data e hora do recontato no formato ISO 8601. SEMPRE use offset -03:00 (horário de Brasília). Exemplo: para 20/05/2026 às 10:00 use "2026-05-20T10:00:00-03:00"' },
        },
        required: ['contato_nome', 'contato_telefone', 'mensagem_inicial', 'agendado_para'],
      },
    },
  },
]

// ─── Tipo para tool call retornado pela OpenAI ────────────────────────────────

interface ToolCall {
  id: string
  type: string
  function: {
    name: string
    arguments: string
  }
}

// ─── Executor de tool calls — Google Calendar ─────────────────────────────────

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

// ─── Executor de tool calls — Agendamentos Hubtek ────────────────────────────

async function executarAppointmentToolCall(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string,
  instanceName: string
): Promise<string> {
  const supabase = createServiceClient()

  try {
    if (toolName === 'criar_agendamento_hubtek') {
      const { data, error } = await supabase
        .from('appointments')
        .insert({
          tenant_id: tenantId,
          instance_name: instanceName,
          contato_nome: String(args.contato_nome),
          contato_telefone: String(args.contato_telefone),
          servico: String(args.servico),
          data_hora: String(args.data_hora),
          antecedencia_horas: Number(args.antecedencia_horas ?? 24),
          status: 'pendente',
        })
        .select('id, data_hora')
        .single()

      if (error) {
        console.error('[appointment tool] criar_agendamento_hubtek:', error)
        return 'Erro ao criar agendamento. Tente novamente.'
      }

      const d = new Date(data.data_hora)
      const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
      const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
      return `Agendamento criado para ${args.contato_nome} em ${dataFmt} às ${horaFmt}. ID: ${data.id}`
    }

    if (toolName === 'listar_agendamentos_cliente') {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, servico, data_hora, status')
        .eq('tenant_id', tenantId)
        .eq('contato_telefone', String(args.contato_telefone))
        .not('status', 'eq', 'cancelado')
        .order('data_hora', { ascending: true })
        .limit(5)

      if (error) {
        console.error('[appointment tool] listar_agendamentos_cliente:', error)
        return 'Erro ao buscar agendamentos.'
      }

      if (!data || data.length === 0) return 'Nenhum agendamento encontrado para este cliente.'

      const lista = data.map(a => {
        const d = new Date(a.data_hora)
        const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
        const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
        return `• ${dataFmt} às ${horaFmt} — ${a.servico} (${a.status}) — ID: ${a.id}`
      }).join('\n')

      return `Agendamentos encontrados:\n${lista}`
    }

    if (toolName === 'confirmar_agendamento') {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmado' })
        .eq('id', String(args.appointment_id))
        .eq('tenant_id', tenantId)

      if (error) {
        console.error('[appointment tool] confirmar_agendamento:', error)
        return 'Erro ao confirmar agendamento.'
      }

      return `Agendamento ${args.appointment_id} confirmado com sucesso.`
    }

    if (toolName === 'cancelar_agendamento_hubtek') {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelado' })
        .eq('id', String(args.appointment_id))
        .eq('tenant_id', tenantId)

      if (error) {
        console.error('[appointment tool] cancelar_agendamento_hubtek:', error)
        return 'Erro ao cancelar agendamento.'
      }

      return `Agendamento ${args.appointment_id} cancelado com sucesso.`
    }

    if (toolName === 'criar_recontato') {
      const { error } = await supabase
        .from('scheduled_tasks')
        .insert({
          tenant_id: tenantId,
          instance_name: instanceName,
          contato_telefone: String(args.contato_telefone),
          contato_nome: String(args.contato_nome),
          tipo: 'me_chama_depois',
          mensagem_inicial: String(args.mensagem_inicial),
          agendado_para: String(args.agendado_para),
          status: 'pendente',
          criado_por: null,
        })

      if (error) {
        console.error('[appointment tool] criar_recontato:', error)
        return 'Erro ao criar recontato.'
      }

      const d = new Date(String(args.agendado_para))
      const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
      const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
      return `Recontato agendado para ${args.contato_nome} em ${dataFmt} às ${horaFmt}.`
    }

    return 'Ação não reconhecida.'
  } catch (err) {
    console.error(`[appointment tool] Erro em ${toolName}:`, err)
    return 'Erro ao executar ação de agendamento. Tente novamente.'
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

// ─── Helpers HyDE ─────────────────────────────────────────────────────────────

async function gerarRespostaHipotetica(pergunta: string): Promise<string> {
  try {
    const resposta = await openAIChatCompletion([
      {
        role: 'system',
        content: 'Você é um assistente de atendimento. Gere uma resposta hipotética detalhada para a pergunta abaixo, como se soubesse a resposta completa. Use linguagem direta com fatos, valores e detalhes operacionais. Responda em português.',
      },
      { role: 'user', content: pergunta },
    ], { temperature: 0, maxTokens: 300 })
    return `${pergunta} ${resposta.content}`
  } catch {
    return pergunta
  }
}

async function normalizarPergunta(pergunta: string): Promise<string> {
  try {
    const resposta = await openAIChatCompletion([
      {
        role: 'system',
        content: 'Corrija erros ortográficos e expanda abreviações do texto abaixo. Retorne apenas o texto corrigido, sem explicações.',
      },
      { role: 'user', content: pergunta },
    ], { temperature: 0, maxTokens: 100 })
    return resposta.content.trim() || pergunta
  } catch {
    return pergunta
  }
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

  // 8. Busca semântica com HyDE + normalização
  let knowledgeDocs: Array<{ conteudo_texto: string; similarity: number; criado_em: string }> = []
  try {
    const perguntaNormalizada = await normalizarPergunta(conteudoProcessado)
    const textoParaEmbedding = await gerarRespostaHipotetica(perguntaNormalizada)
    const embedding = await generateEmbedding(textoParaEmbedding)

    const { data: docs } = await supabase.rpc('match_knowledge', {
      query_embedding: embedding,
      match_tenant_id: payload.tenantId,
      match_threshold: 0.6,
      match_count: 8,
    })

    knowledgeDocs = ((docs ?? []) as Array<{ conteudo_texto: string; similarity: number; criado_em: string }>)
      .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
  } catch (err) {
    console.error('[process-message] Falha na busca semântica:', err)
  }

  // 9. Config extra (campos não tipados no AgentConfig)
  const configExtra = config as unknown as Record<string, unknown>
  const calendarConfig = configExtra.google_calendar_config as GoogleCalendarConfig | null
  const funcoesAtivas = (configExtra.funcoes_ativas as string[]) ?? []

  // 10. Histórico e system prompt
  const historico = await getRecentMessages(supabase, conversa.id, 10)
  const temCalendar = !!(calendarConfig?.client_email && calendarConfig?.private_key && calendarConfig?.calendar_id)
  const temAgendamentosHubtek = funcoesAtivas.includes('agendamentos')

  const chatMessages: ChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(
        config.prompt_principal ?? '',
        knowledgeDocs,
        temCalendar,
        temAgendamentosHubtek,
        config.horario_inicio,
        config.horario_fim
      ),
    },
    ...historico.slice(0, -1).map(m => ({
      role: (m.origem === 'agente' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.transcricao || m.conteudo || '',
    })),
    { role: 'user', content: conteudoProcessado },
  ]

  // Monta lista de tools ativas
  const toolsAtivas: Tool[] = []
  if (temCalendar) toolsAtivas.push(...CALENDAR_TOOLS)
  if (temAgendamentosHubtek) toolsAtivas.push(...APPOINTMENT_TOOLS)

  const usarTools = toolsAtivas.length > 0 && config.motor_ia_principal === 'openai'

  // 11. Geração de resposta
  let resultado: { content: string; tokensIn: number; tokensOut: number } | null = null
  let motorUsado = config.motor_ia_principal
  const chatConfig = { temperature: Number(config.temperatura), maxTokens: config.max_tokens }

  // Flag: bloqueia detectarMeChama se a tool criar_recontato já foi usada
  let recontotoCriadoPorTool = false

  try {
    if (usarTools) {
      const respostaComTools = await openAIChatCompletionWithTools(
        chatMessages,
        toolsAtivas as Parameters<typeof openAIChatCompletionWithTools>[1],
        chatConfig
      )

      if (respostaComTools.toolCalls && respostaComTools.toolCalls.length > 0) {
        const toolResults: ChatMessage[] = []
        const toolCallsTyped = respostaComTools.toolCalls as unknown as ToolCall[]

        for (const tc of toolCallsTyped) {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
          const isAppointmentTool = APPOINTMENT_TOOLS.some(t => t.function.name === tc.function.name)

          // Marca flag se recontato foi criado via tool
          if (tc.function.name === 'criar_recontato') recontotoCriadoPorTool = true

          const toolResult = isAppointmentTool
            ? await executarAppointmentToolCall(tc.function.name, args, payload.tenantId, payload.instanceName)
            : await executarToolCall(tc.function.name, args, calendarConfig!, config.horario_inicio, config.horario_fim)

          toolResults.push({
            role: 'tool' as const,
            content: toolResult,
            tool_call_id: tc.id,
          } as ChatMessage)
        }

        const messagesComTools: ChatMessage[] = [
          ...chatMessages,
          { role: 'assistant', content: '', tool_calls: respostaComTools.toolCalls } as unknown as ChatMessage,
          ...toolResults,
        ]
        resultado = await openAIChatCompletion(messagesComTools, chatConfig)
      } else {
        resultado = {
          content: respostaComTools.content,
          tokensIn: respostaComTools.tokensIn,
          tokensOut: respostaComTools.tokensOut,
        }
      }
    } else {
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

  // 14. Detecta intenção "me chama depois" — fire-and-forget
  // Bloqueado se criar_recontato já foi executada via tool nesta mensagem
  if (!recontotoCriadoPorTool) {
    detectarMeChama({
      mensagemCliente: conteudoProcessado,
      conversationId: conversa.id,
      tenantId: payload.tenantId,
      instanceName: payload.instanceName,
      contatoNome: conversa.contato_nome ?? payload.pushName ?? payload.phone,
      contatoTelefone: payload.phone,
    }).catch((err) =>
      console.error('[process-message] detectarMeChama falhou:', err)
    )
  }
}
