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
import { sendTextMessage, sendPresence, downloadMediaAsBase64 } from '@/lib/evolution/client'
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
  getAccessToken,
  type GoogleCalendarConfig,
} from '@/lib/google-calendar'
import { detectarMeChama } from './detect-me-chama'
import { ETAPA_INICIAL } from '@/lib/crm'

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIAS_PT: Record<number, string> = {
  0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab',
}

const CUSTO_POR_1K: Record<string, { entrada: number; saida: number }> = {
  openai:    { entrada: 0.025, saida: 0.1 },
  anthropic: { entrada: 0.015, saida: 0.075 },
}

const MOTOR_PERFIL               = 'gpt-4o-mini'
const PERFIL_EXTRACTION_INTERVAL = 5

const SAUDACOES_REGEX = /^(oi|olá|ola|opa|hey|hello|bom dia|boa tarde|boa noite|e aí|eai|e ai|tudo bem|tudo bom|salve)[!?.,:]*$/i

const HUMANO_REGEX = /\b(falar\s+com\s+(humano|pessoa|atendente|operador|algu[eé]m)|gostaria\s+de\s+(falar|ser\s+atendid[oa])\s+(com\s+)?(um\s+)?(humano|pessoa|atendente|operador)?|gostaria\s+de\s+um\s+atendente|poderia\s+me\s+transferir|pode\s+me\s+transferir|transferir\s+(para|pra)|atendimento\s+humano|atendente\s+humano|quero\s+(um\s+)?(humano|pessoa|atendente|operador)|me\s+passa\s+(para|pra)\s+(um\s+)?(humano|atendente|operador)|me\s+transfere|transfere\s+(para|pra)|falar\s+com\s+algu[eé]m|preciso\s+de\s+(um\s+)?atendente|n[aã]o\s+quero\s+(falar\s+com\s+)?(?:rob[oô]|ia|bot|m[aá]quina)|quero\s+ser\s+atendido|falar\s+com\s+uma\s+pessoa|ser\s+atendid[oa]\s+por\s+um\s+humano|atendimento\s+com\s+(uma?\s+)?(pessoa|humano)|prefiro\s+(falar|conversar)\s+com\s+(uma?\s+)?(pessoa|humano|atendente)|tem\s+(algum|algu[eé]m)\s+(humano|atendente|operador)|existe\s+(algum|algu[eé]m)\s+(humano|atendente)|pode\s+me\s+conectar\s+com|conectar\s+com\s+um\s+atendente|chamar\s+um\s+atendente|fala\s+com\s+algu[eé]m)\b/i

const FALHA_AGENTE_REGEX = /n[aã]o (tenho|encontrei|possuo|localizei)|n[aã]o (está|esta) (dispon[ií]vel|na base)|n[aã]o (sei|consigo|posso) (responder|ajudar|inform)/i

const FRUSTRACAO_REGEX = /insatisfeito|absurdo|ridículo|ridiculo|horrível|horrivel|péssimo|pessimo|lamentável|lamentavel|decepcionante|revoltante|inaceitável|inaceitavel|não funciona|nao funciona|não resolveu|nao resolveu|tô com raiva|to com raiva|que vergonha|me enganaram|fui lesado/i

const FUNIS_VALIDOS = ['vendas', 'suporte', 'agendamentos', 'qualificacao'] as const
type FunilTipo = typeof FUNIS_VALIDOS[number]

// ─── Prompt complementar por função ──────────────────────────────────────────

const PROMPT_COMPLEMENTAR: Record<FunilTipo, string> = {
  vendas: `
FOCO PRINCIPAL — VENDAS CONSULTIVAS:
Seu objetivo central é conduzir o cliente ao fechamento da venda.
Entenda a necessidade, apresente valor, identifique objeções e responda com empatia.
Nunca force a venda. Ao perceber interesse claro, avance para proposta de valor.
Após cada interação, retorne ao objetivo de venda — não perca o fio condutor.

CAPACIDADES DE SUPORTE (execute quando solicitado, depois retome o foco em vendas):
- AGENDAMENTO: Se o cliente pedir para marcar uma reunião, demonstração ou visita, execute o agendamento normalmente usando as ferramentas disponíveis. Após confirmar, aproveite para avançar na conversa de venda.
- SUPORTE BÁSICO: Se o cliente tiver uma dúvida ou problema simples relacionado ao produto/serviço, resolva de forma objetiva. Se não conseguir resolver, encaminhe para atendimento humano sem abandonar o contexto de venda.
- QUALIFICAÇÃO: Você já faz isso naturalmente ao entender o perfil do cliente — não precisa mudar o tom.`,

  suporte: `
FOCO PRINCIPAL — SUPORTE E RESOLUÇÃO DE PROBLEMAS:
Seu objetivo central é resolver o problema do cliente com clareza, agilidade e empatia.
Confirme sempre se o problema foi resolvido antes de encerrar.
Se não conseguir resolver, encaminhe para atendimento humano.
Após cada interação, mantenha o foco em garantir que o cliente saia com o problema resolvido.

CAPACIDADES DE SUPORTE (execute quando solicitado, depois retome o foco em suporte):
- AGENDAMENTO: Se o cliente precisar agendar um atendimento técnico, visita ou retorno, execute o agendamento normalmente. Após confirmar, verifique se ainda há algum problema em aberto para resolver.
- VENDAS BÁSICA: Se durante o suporte o cliente demonstrar interesse em um produto, serviço adicional ou upgrade, apresente a opção de forma natural e objetiva — sem forçar. Registre o interesse e siga resolvendo o problema principal.
- QUALIFICAÇÃO: Se perceber que o cliente tem potencial para outros serviços, registre mentalmente para enriquecer o perfil — mas não mude o foco do atendimento.`,

  agendamentos: `
FOCO PRINCIPAL — AGENDAMENTOS:
Seu objetivo central é encontrar o melhor horário, confirmar os dados e registrar o compromisso.
Sempre confirme nome, data, hora e serviço antes de finalizar.
Envie um resumo claro após cada agendamento criado.
Após confirmar o agendamento, verifique se o cliente precisa de mais alguma coisa relacionada.

CAPACIDADES DE SUPORTE (execute quando solicitado, depois retome o foco em agendamentos):
- SUPORTE BÁSICO: Se o cliente tiver uma dúvida simples sobre o serviço que vai agendar, responda de forma objetiva. Se não souber, oriente a perguntar no dia do atendimento.
- VENDAS BÁSICA: Se o cliente demonstrar interesse em serviços adicionais ao agendar, apresente as opções disponíveis de forma natural. Após esclarecer, conduza ao fechamento do agendamento.
- QUALIFICAÇÃO: Ao coletar os dados para o agendamento, você naturalmente qualifica o cliente — aproveite para entender melhor o perfil e enriquecer o cadastro.`,

  qualificacao: `
FOCO PRINCIPAL — QUALIFICAÇÃO DE LEADS:
Seu objetivo central é entender o perfil, a necessidade e o momento de compra do cliente.
Faça perguntas estratégicas de forma natural — não pareça um questionário.
Ao final, classifique internamente o lead como quente, morno ou frio e conduza para o próximo passo adequado.
Após cada interação, retorne ao objetivo de qualificar — não perca informações valiosas sobre o cliente.

CAPACIDADES DE SUPORTE (execute quando solicitado, depois retome o foco em qualificação):
- AGENDAMENTO: Se o cliente demonstrar interesse em conhecer mais ou quiser uma conversa aprofundada, proponha e execute um agendamento. Use o agendamento como parte da qualificação — é um sinal forte de interesse.
- SUPORTE BÁSICO: Se o cliente tiver uma dúvida simples, responda de forma objetiva e use a resposta como gancho para continuar qualificando.
- VENDAS BÁSICA: Se o cliente já demonstrar prontidão para comprar durante a qualificação, não bloqueie — apresente a proposta de valor e avance. Leads quentes não precisam de qualificação prolongada.`,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcularCusto(motor: string, tokensIn: number, tokensOut: number): number {
  const tabela = CUSTO_POR_1K[motor] ?? CUSTO_POR_1K.openai
  return (tokensIn / 1000) * tabela.entrada + (tokensOut / 1000) * tabela.saida
}

function isWithinOperatingHours(horarioInicio: string, horarioFim: string, diasFuncionamento: string[]): boolean {
  const agora = new Date()
  const agoraBrasil = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const diaSemana = DIAS_PT[agoraBrasil.getUTCDay()]
  if (!diasFuncionamento.includes(diaSemana)) return false
  const [hI, mI] = horarioInicio.split(':').map(Number)
  const [hF, mF] = horarioFim.split(':').map(Number)
  const minutoAtual = agoraBrasil.getUTCHours() * 60 + agoraBrasil.getUTCMinutes()
  return minutoAtual >= hI * 60 + mI && minutoAtual <= hF * 60 + mF
}

function getSaudacao(): string {
  const agora = new Date()
  const hora = new Date(agora.getTime() - 3 * 60 * 60 * 1000).getUTCHours()
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

function calcularDelayDigitacao(texto: string): number {
  return Math.min(Math.max(texto.length * 30, 1000), 4000)
}

// ─── Conversão Markdown → WhatsApp + quebra em blocos ────────────────────────

function converterMarkdownParaWhatsApp(texto: string): string {
  return texto
    .replace(/\*\*\*(.+?)\*\*\*/g, '*$1*')   // ***bold+italic*** → *bold+italic*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')        // **negrito** → *negrito*
    .replace(/\_\_(.+?)\_\_/g, '_$1_')        // __itálico__ → _itálico_
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')    // # Título → *Título*
    .replace(/^-{3,}$/gm, '')                 // remove linhas ---
    .replace(/\n{3,}/g, '\n\n')               // normaliza espaços extras
    .trim()
}

// AJUSTE (F6-17 / feedback Gabriel): cada parágrafo separado por linha em
// branco agora vira sua própria mensagem no WhatsApp, em vez de ser
// reagrupado em blocos de até 1200 caracteres. Isso permite que o prompt
// controle diretamente o tamanho e a quantidade de mensagens enviadas —
// essencial para o comportamento de "várias mensagens curtas" da Nina.
// Parágrafos individuais muito longos (ex: um cardápio extenso em um único
// parágrafo) ainda são fatiados em pedaços de até 1200 caracteres para não
// estourar o limite prático de uma mensagem de WhatsApp.
function quebrarEmBlocos(texto: string): string[] {
  const textoFormatado = converterMarkdownParaWhatsApp(texto)
  const paragrafos = textoFormatado.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  if (paragrafos.length <= 1) return [textoFormatado]

  const blocos: string[] = []
  for (const p of paragrafos) {
    if (p.length <= 1200) {
      blocos.push(p)
    } else {
      for (let i = 0; i < p.length; i += 1200) {
        blocos.push(p.slice(i, i + 1200).trim())
      }
    }
  }

  // Máximo 5 blocos por resposta para evitar spam de mensagens sequenciais
  return blocos.slice(0, 5)
}

// ─── Feriados nacionais Brasil ────────────────────────────────────────────────

function getFeriadosDoAno(year: number): Map<string, string> {
  const feriados = new Map<string, string>()
  const fixos: [number, number, string][] = [
    [1, 1, 'Ano Novo'], [4, 21, 'Tiradentes'], [5, 1, 'Dia do Trabalho'],
    [9, 7, 'Independência do Brasil'], [10, 12, 'Nossa Senhora Aparecida'],
    [11, 2, 'Finados'], [11, 15, 'Proclamação da República'],
    [11, 20, 'Consciência Negra'], [12, 25, 'Natal'],
  ]
  fixos.forEach(([m, d, label]) => {
    feriados.set(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, label)
  })
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d2 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d2 - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451)
  const pMonth = Math.floor((h + l - 7 * m2 + 114) / 31)
  const pDay = ((h + l - 7 * m2 + 114) % 31) + 1
  const pascoa = new Date(year, pMonth - 1, pDay)
  const addDias = (base: Date, dias: number, label: string) => {
    const dt = new Date(base.getTime() + dias * 86400000)
    feriados.set(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
      label
    )
  }
  addDias(pascoa, -48, 'Carnaval (segunda-feira)')
  addDias(pascoa, -47, 'Carnaval (terça-feira)')
  addDias(pascoa, -2, 'Sexta-feira Santa')
  addDias(pascoa, 0, 'Páscoa')
  addDias(pascoa, 60, 'Corpus Christi')
  return feriados
}

function getFeriadosProximos(): string {
  const agora = new Date()
  const agoraBR = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const hoje = agoraBR.toISOString().slice(0, 10)
  const em60Dias = new Date(agoraBR.getTime() + 60 * 86400000).toISOString().slice(0, 10)
  const ano = agoraBR.getFullYear()
  const todos = new Map([
    ...Array.from(getFeriadosDoAno(ano).entries()),
    ...Array.from(getFeriadosDoAno(ano + 1).entries()),
  ])
  const proximos: string[] = []
  Array.from(todos.entries()).forEach(([key, label]) => {
    if (key >= hoje && key <= em60Dias) {
      const d = new Date(key + 'T12:00:00-03:00')
      const fmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      proximos.push(`• ${fmt} — ${label}`)
    }
  })
  return proximos.sort().join('\n')
}

// ─── Profissionais do tenant ──────────────────────────────────────────────────

async function getProfissionaisDoTenant(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string
): Promise<Array<{ nome: string; especialidade: string | null }>> {
  try {
    const { data } = await supabase
      .from('profissionais')
      .select('nome, especialidade')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .order('nome', { ascending: true })
    return data ?? []
  } catch {
    return []
  }
}

// ─── Tipagem de intenção ──────────────────────────────────────────────────────

type Intencao = 'saudacao' | 'agendamento' | 'reclamacao' | 'duvida' | 'fora_escopo'

function classificarIntencao(mensagem: string): Intencao {
  const m = mensagem.toLowerCase().trim()
  if (SAUDACOES_REGEX.test(m)) return 'saudacao'
  if (FRUSTRACAO_REGEX.test(m)) return 'reclamacao'
  if (/agendar|marcar|horário|horario|disponível|disponivel|encaixar|reagendar|cancelar|remarca|consulta|atendimento/.test(m))
    return 'agendamento'
  if (/não sei|nao sei|fora do assunto|outro assunto|não (é|e) sobre|piada|brincadeira/.test(m))
    return 'fora_escopo'
  return 'duvida'
}

// ─── Perfil do cliente ────────────────────────────────────────────────────────

interface ContactProfile {
  contato_nome: string | null
  cidade: string | null
  preferencias: Record<string, unknown>
  historico_resumido: string | null
}

interface PerfilExtraido {
  nome: string | null
  cidade: string | null
  preferencias: Record<string, string>
  resumo_conversa: string | null
}

async function buscarPerfilCliente(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  telefone: string
): Promise<ContactProfile | null> {
  const { data } = await supabase
    .from('contact_profiles')
    .select('contato_nome, cidade, preferencias, historico_resumido')
    .eq('tenant_id', tenantId)
    .eq('contato_telefone', telefone)
    .maybeSingle()
  return data as ContactProfile | null
}

async function salvarPerfilCliente(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  telefone: string,
  perfilAtual: ContactProfile | null,
  novosDados: Partial<PerfilExtraido> & { nome?: string | null }
): Promise<void> {
  try {
    const prefAtual = (perfilAtual?.preferencias ?? {}) as Record<string, unknown>
    const prefNovo  = (novosDados.preferencias ?? {}) as Record<string, unknown>
    await supabase.from('contact_profiles').upsert({
      tenant_id:          tenantId,
      contato_telefone:   telefone,
      contato_nome:       novosDados.nome || perfilAtual?.contato_nome || null,
      cidade:             novosDados.cidade || perfilAtual?.cidade || null,
      preferencias:       { ...prefAtual, ...prefNovo },
      historico_resumido: novosDados.resumo_conversa || perfilAtual?.historico_resumido || null,
      ultima_atualizacao: new Date().toISOString(),
    }, { onConflict: 'tenant_id,contato_telefone' })
  } catch (err) {
    console.error('[process-message] salvarPerfilCliente falhou:', err)
  }
}

async function extrairPerfilDaConversa(
  mensagens: Array<{ origem: string; conteudo: string | null; transcricao?: string | null }>
): Promise<PerfilExtraido | null> {
  if (mensagens.length === 0) return null
  const apenasCliente = mensagens
    .filter(m => m.origem === 'cliente')
    .map(m => m.transcricao || m.conteudo || '')
    .filter(Boolean)
    .join('\n')
  if (!apenasCliente.trim()) return null
  try {
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const response = await openai.chat.completions.create({
      model: MOTOR_PERFIL,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: `Analise as mensagens abaixo enviadas por um cliente em um atendimento via WhatsApp.
Extraia SOMENTE informações que o cliente mencionou espontaneamente — nunca invente ou suponha.
Retorne um JSON válido com esta estrutura exata (sem markdown, sem explicações):
{
  "nome": "nome mencionado pelo cliente ou null",
  "cidade": "cidade ou região mencionada ou null",
  "preferencias": {
    "chave_descritiva": "valor observado"
  },
  "resumo_conversa": "resumo em 1-2 frases do que o cliente precisava nesta conversa ou null"
}
Se não houver nada relevante para um campo, use null ou {} para preferencias.
Não inclua informações sobre agendamentos, datas ou horários marcados no resumo_conversa.`,
        },
        { role: 'user', content: apenasCliente },
      ],
    })
    const raw = response.choices[0]?.message?.content?.trim() ?? ''
    if (!raw) return null
    return JSON.parse(raw) as PerfilExtraido
  } catch (err) {
    console.error('[perfil] Falha na extração de perfil:', err)
    return null
  }
}

function deveExtrairPerfil(totalMensagensCliente: number): boolean {
  return totalMensagensCliente > 0 && totalMensagensCliente % PERFIL_EXTRACTION_INTERVAL === 0
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  promptPrincipal: string,
  knowledgeDocs: Array<{ conteudo_texto: string; criado_em: string }>,
  temCalendar: boolean,
  temAgendamentosHubtek: boolean,
  horarioInicio: string,
  horarioFim: string,
  diasFuncionamento: string[],
  telefoneCliente: string,
  intencao: Intencao,
  perfilCliente: string,
  historicoResumido: string,
  profissionais: Array<{ nome: string; especialidade: string | null }>,
  feriadosProximos: string,
  funcaoPrincipal?: string,
  funilAnterior?: string,
): string {
  let prompt = promptPrincipal || 'Você é um assistente de atendimento ao cliente prestativo e cordial.'

  // Prompt complementar dinâmico por função
  if (funcaoPrincipal && PROMPT_COMPLEMENTAR[funcaoPrincipal as FunilTipo]) {
    prompt += `\n\n${PROMPT_COMPLEMENTAR[funcaoPrincipal as FunilTipo]}`
  }

  // Instrução de transição quando o funil mudou durante uma conversa em andamento
  if (funilAnterior && funcaoPrincipal && funilAnterior !== funcaoPrincipal) {
    const LABELS: Record<string, string> = {
      vendas: 'vendas', suporte: 'suporte',
      agendamentos: 'agendamentos', qualificacao: 'qualificação',
    }
    prompt += `\n\nTRANSIÇÃO DE CONTEXTO: Esta conversa foi iniciada com foco em ${LABELS[funilAnterior] ?? funilAnterior}, mas o atendimento agora está focado em ${LABELS[funcaoPrincipal] ?? funcaoPrincipal}.`
    prompt += `\nSe a conversa anterior ainda estava em aberto, conclua educadamente aquele assunto em uma frase antes de reposicionar o atendimento para o novo foco.`
    prompt += `\nNão mencione ao cliente que houve troca de modo ou configuração — apenas conduza naturalmente.`
  }

  const saudacao = getSaudacao()
  prompt += `\n\nSAUDAÇÃO ATUAL: Use "${saudacao}" quando for a primeira mensagem ou quando fizer sentido cumprimentar.`

  const DIAS_LABEL: Record<string, string> = {
    dom: 'domingo', seg: 'segunda', ter: 'terça', qua: 'quarta',
    qui: 'quinta', sex: 'sexta', sab: 'sábado',
  }
  const diasLabel = diasFuncionamento.map(d => DIAS_LABEL[d] ?? d).join(', ')
  prompt += `\n\nHORÁRIO DE FUNCIONAMENTO OFICIAL: ${diasLabel}, das ${horarioInicio} às ${horarioFim} (horário de Brasília).`
  prompt += `\nEsta é a fonte ÚNICA e DEFINITIVA do horário de atendimento. IGNORE qualquer horário diferente que apareça nos documentos da base de conhecimento — eles podem estar desatualizados.`
  prompt += `\nSTATUS ATUAL: ESTAMOS ATENDENDO AGORA. Se o cliente perguntar se estão atendendo ou se está aberto, confirme que SIM.`

  prompt += `\n\nINTENÇÃO DETECTADA: ${intencao}.`
  if (intencao === 'reclamacao') prompt += ' O cliente demonstra frustração. Seja mais empático, reconheça o problema antes de tentar resolver.'
  if (intencao === 'saudacao') prompt += ' É uma saudação simples. Responda com cumprimento + pergunta aberta. Não busque dados na base para isso.'
  if (intencao === 'fora_escopo') prompt += ' A mensagem parece fora do seu escopo. Redirecione gentilmente para o que você pode ajudar.'

  if (perfilCliente && intencao !== 'saudacao') {
    prompt += `\n\nPERFIL DO CLIENTE:\n${perfilCliente}`
  }
  if (historicoResumido && intencao !== 'saudacao') {
    prompt += `\n\nRESUMO DO CONTEXTO DESTA CONVERSA:\n${historicoResumido}`
  }

  prompt += `

REGRAS DE COMPORTAMENTO:

1. BASE DE CONHECIMENTO — PRIORIDADE MÁXIMA
   - Para informações factuais específicas (preços, valores, prazos, políticas, endereços, promoções, dados da empresa), use PREFERENCIALMENTE o que estiver na base de conhecimento abaixo.
   - Se a informação estiver na base, use-a com precisão. Não invente valores numéricos ou datas que não estejam lá.
   - Se dois trechos trouxerem valores diferentes para a mesma informação, use o trecho de número menor (mais recente).

2. QUANDO A BASE NÃO TEM A RESPOSTA
   - Para perguntas gerais que não exigem dados específicos da empresa, responda naturalmente.
   - Para perguntas que exigem dados específicos da empresa e que não estão na base, diga: "Não tenho essa informação no momento. Para mais detalhes, entre em contato diretamente conosco."

3. RESPOSTAS
   - Seja direto e objetivo. Responda o que foi perguntado.
   - Não repita a pergunta do cliente na resposta.
   - Não use frases como "Claro!", "Com certeza!", "Ótima pergunta!" — vá direto ao ponto.
   - NUNCA invente contexto ou assuma o que o cliente está fazendo.
   - NUNCA mencione ferramentas internas, sistemas, IDs, ou processos técnicos ao cliente.
   - NUNCA confirme ou negue informações que não foram fornecidas pelo cliente nesta conversa.
   - Finalize com uma pergunta curta de continuidade apenas quando fizer sentido.
   - Quebre respostas longas em parágrafos curtos — mais natural para WhatsApp.
   - FORMATAÇÃO: Nunca use Markdown com ** ou ##. Para destacar algo, use *texto* (um asterisco só — formato nativo do WhatsApp). Para listas, use • ou - no início da linha.`

  if (knowledgeDocs.length > 0) {
    prompt += '\n\nBASE DE CONHECIMENTO (do mais recente para o mais antigo — priorize os primeiros em caso de conflito):\n'
    prompt += knowledgeDocs.map((d, i) => `\n[Trecho ${i + 1}]\n${d.conteudo_texto}`).join('\n---')
  } else {
    prompt += '\n\nBase de conhecimento: nenhum trecho relevante encontrado. Use seu conhecimento geral para responder perguntas simples de atendimento.'
  }

  // AJUSTE: o bloco genérico de "AGENDA" (linguagem/tools do Google Calendar
  // puro) só é injetado quando o tenant NÃO usa o sistema interno de
  // Agendamentos Hubtek. Antes esse bloco era injetado sempre que temCalendar
  // era true, mesmo com Agendamentos Hubtek ativo — o que confundia o modelo,
  // pois ele passava a citar nomes de tools (ex: "criar_agendamento") que não
  // estavam disponíveis nesse fluxo (o fluxo Hubtek usa "criar_agendamento_hubtek").
  if (temCalendar && !temAgendamentosHubtek) {
    prompt += `\n\nAGENDA: Você tem acesso à agenda da empresa. Horário: ${horarioInicio} às ${horarioFim}.`
    prompt += '\nAgendamento: consulte slots disponíveis, confirme data/hora e crie o evento.'
    prompt += '\nReagendamento: localize pelo nome do cliente e reagende.'
    prompt += '\nCancelamento: localize, confirme com o cliente e delete.'
    prompt += '\nSempre confirme com o cliente após cada ação.'
  }

  if (temAgendamentosHubtek) {
    prompt += `\n\nAGENDAMENTOS INTERNOS: Você pode criar, consultar, confirmar, reagendar e cancelar agendamentos diretamente no sistema.`
    prompt += '\nPara reagendar: SEMPRE use primeiro listar_agendamentos_cliente para obter o ID correto, depois chame reagendar_agendamento_hubtek UMA ÚNICA VEZ.'
    prompt += '\nPara cancelar: use listar_agendamentos_cliente para obter o ID, depois chame cancelar_agendamento_hubtek UMA ÚNICA VEZ.'
    prompt += '\nPara recontatos: use criar_recontato quando o cliente pedir para ser chamado depois.'
    prompt += '\nNUNCA mencione agendamentos existentes espontaneamente na saudação ou em respostas gerais.'
    prompt += '\nEXECUTE a ação ANTES de responder ao cliente. Jamais diga "Um momento, por favor" sem já ter executado.'
    prompt += `\nDATAS E HORÁRIOS: sempre use o fuso horário de Brasília (offset -03:00).`
    prompt += `\n\nTELEFONE PARA AGENDAMENTOS:`
    prompt += `\n1. "este número", "meu número" → use ${telefoneCliente}`
    prompt += `\n2. Número com DDD → normalize e use`
    prompt += `\n3. Número SEM DDD → pergunte: "Qual o DDD? Aqui costumamos usar 51."`
    prompt += `\n4. NUNCA salve número sem DDD completo`
    prompt += '\nNUNCA cancele ou modifique agendamentos sem o cliente pedir EXPLICITAMENTE.'
    prompt += '\nAntes de cancelar ou reagendar, SEMPRE confirme com o cliente.'
    if (profissionais.length > 0) {
      prompt += `\n\nPROFISSIONAIS DA EQUIPE:\n`
      prompt += profissionais.map(p => `• ${p.nome}${p.especialidade ? ` — ${p.especialidade}` : ''}`).join('\n')
      prompt += `\nSEMPRE pergunte o profissional de preferência ANTES de criar o agendamento.`
    }
    prompt += `\nAntes de criar um agendamento, use listar_agendamentos_cliente para verificar conflitos de horário.`

    // AJUSTE (F6-17 / feedback Gabriel, item 3): instrução de consulta de
    // disponibilidade sempre presente no fluxo Hubtek — não depende do
    // Google Calendar estar integrado.
    prompt += `\n\nCONSULTA DE HORÁRIOS LIVRES: use SEMPRE listar_horarios_disponiveis_hubtek antes de sugerir qualquer data ou horário ao cliente.`
    prompt += '\nEssa ferramenta já cruza a agenda interna da empresa com o horário de funcionamento cadastrado e retorna apenas horários realmente livres.'
    prompt += '\nNunca invente, suponha ou estime horários disponíveis — baseie toda sugestão estritamente no retorno dessa ferramenta.'
    prompt += '\nFLUXO OBRIGATÓRIO DE AGENDAMENTO:'
    prompt += '\n1. Pergunte ao cliente qual período prefere (manhã ou tarde).'
    prompt += '\n2. Chame listar_horarios_disponiveis_hubtek para o dia adequado.'
    prompt += '\n3. Ofereça exatamente 2 horários específicos, escolhidos dentro do retorno da ferramenta e dentro do período que o cliente pediu.'
    prompt += '\n4. Aguarde a escolha explícita do cliente. NUNCA crie o agendamento sem essa confirmação.'
    prompt += '\n5. Só então chame criar_agendamento_hubtek com o horário escolhido.'
    prompt += '\nSe a ferramenta indicar que não há horários livres no dia, ofereça outra data — nunca sugira um horário que não veio no retorno.'

    // AJUSTE (feedback Gabriel 15/07): o agente estava criando o agendamento
    // logo após SUGERIR um horário, sem o cliente ter escolhido. Regra
    // explícita e inequívoca sobre o que conta como confirmação.
    prompt += `\n\nREGRA CRÍTICA DE CONFIRMAÇÃO:`
    prompt += '\nSó considere um horário confirmado quando o CLIENTE escreveu, em uma mensagem dele, qual horário quer (ex: "pode ser às 13h", "prefiro quinta às 10h", "o primeiro").'
    prompt += '\nVocê sugerir um horário NÃO é confirmação. O cliente perguntar sobre horários NÃO é confirmação. O cliente dizer que tem interesse NÃO é confirmação.'
    prompt += '\nEnquanto não houver essa escolha explícita, sua única ação é conversar e oferecer opções — jamais chame criar_agendamento_hubtek.'
    prompt += '\nDepois de criar, confirme ao cliente repetindo dia e horário exatos.'
  }

  if (feriadosProximos) {
    prompt += `\n\nFERIADOS NACIONAIS PRÓXIMOS (próximos 60 dias):\n${feriadosProximos}`
  }

  const agora = new Date()
  const agoraBrasil = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  prompt += `\n\nDATA E HORA ATUAL (Brasília): ${agoraBrasil.toISOString().slice(0, 10)} às ${agoraBrasil.toISOString().slice(11, 16)}.`
  prompt += `\n\nTELEFONE DO CLIENTE NESTA CONVERSA: ${telefoneCliente}.`
  prompt += '\n\nResponda sempre em português brasileiro.'
  prompt += '\n\nCAPACIDADES DE MÍDIA: Você consegue receber e interpretar áudios (transcrição automática), imagens (visão computacional) e ler textos.'

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
          data:         { type: 'string', description: 'Data no formato YYYY-MM-DD' },
          hora_inicio:  { type: 'string', description: 'Hora de início no formato HH:MM' },
          hora_fim:     { type: 'string', description: 'Hora de fim no formato HH:MM' },
          descricao:    { type: 'string', description: 'Descrição ou observações do agendamento' },
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
          nome_cliente:     { type: 'string', description: 'Nome do cliente para buscar o evento' },
          nova_data:        { type: 'string', description: 'Nova data no formato YYYY-MM-DD' },
          nova_hora_inicio: { type: 'string', description: 'Novo horário de início HH:MM' },
          nova_hora_fim:    { type: 'string', description: 'Novo horário de fim HH:MM' },
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
  // AJUSTE (F6-17 / feedback Gabriel, item 3): tool de consulta de
  // disponibilidade baseada na fonte primária do sistema — a tabela
  // `appointments` (aba Agendamentos da dashboard) cruzada com o horário de
  // funcionamento cadastrado em agent_config. O Google Calendar é usado
  // apenas como verificação extra e opcional dentro do executor: se não
  // estiver integrado ou falhar, a consulta segue normalmente sem travar.
  {
    type: 'function',
    function: {
      name: 'listar_horarios_disponiveis_hubtek',
      description: 'Consulta os horários realmente livres na agenda da empresa para uma data. Use SEMPRE antes de sugerir qualquer horário ao cliente.',
      parameters: {
        type: 'object',
        properties: {
          data:            { type: 'string', description: 'Data no formato YYYY-MM-DD ou texto como "amanhã", "hoje", "15/06"' },
          duracao_minutos: { type: 'number', description: 'Duração do atendimento em minutos. Padrão: 60' },
          profissional:    { type: 'string', description: 'Nome do profissional para filtrar a disponibilidade (opcional)' },
        },
        required: ['data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_agendamento_hubtek',
      description: 'Cria um agendamento interno no sistema Hubtek. SOMENTE chame esta ferramenta depois que o cliente tiver dito EXPLICITAMENTE, em uma mensagem dele, qual data e horário escolheu. Nunca chame com um horário que apenas você sugeriu.',
      parameters: {
        type: 'object',
        properties: {
          contato_nome:     { type: 'string', description: 'Nome do cliente' },
          contato_telefone: { type: 'string', description: 'Telefone do cliente com DDI (ex: 5551999999999)' },
          servico:          { type: 'string', description: 'Serviço ou motivo do agendamento' },
          data_hora:        { type: 'string', description: 'Data e hora ISO 8601 com offset -03:00.' },
          profissional:     { type: 'string', description: 'Nome do profissional responsável (opcional)' },
        },
        required: ['contato_nome', 'contato_telefone', 'servico', 'data_hora'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_agendamentos_cliente',
      description: 'Busca todos os agendamentos ativos de um cliente pelo telefone.',
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
      name: 'reagendar_agendamento_hubtek',
      description: 'Reagenda um agendamento existente para nova data e horário.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID do agendamento a reagendar' },
          nova_data_hora: { type: 'string', description: 'Nova data e hora ISO 8601 com offset -03:00.' },
        },
        required: ['appointment_id', 'nova_data_hora'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_agendamento_hubtek',
      description: 'Cancela um agendamento existente no sistema Hubtek.',
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
          contato_nome:     { type: 'string', description: 'Nome do cliente' },
          contato_telefone: { type: 'string', description: 'Telefone do cliente com DDI' },
          mensagem_inicial: { type: 'string', description: 'Mensagem a enviar no recontato' },
          agendado_para:    { type: 'string', description: 'Data e hora ISO 8601 com offset -03:00.' },
        },
        required: ['contato_nome', 'contato_telefone', 'mensagem_inicial', 'agendado_para'],
      },
    },
  },
]

interface ToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

// ─── Normalização de telefone ─────────────────────────────────────────────────

function normalizarTelefone(tel: string, dddPadrao = '51'): string {
  const digits = tel.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 11) return `55${digits}`
  if (digits.length === 10) return `55${digits}`
  if (digits.length === 9)  return `55${dddPadrao}${digits}`
  if (digits.length === 8)  return `55${dddPadrao}${digits}`
  return digits
}

// ─── Helpers RAG ──────────────────────────────────────────────────────────────

async function normalizarPergunta(pergunta: string): Promise<string> {
  try {
    const resposta = await openAIChatCompletion([
      { role: 'system', content: 'Corrija erros ortográficos e expanda abreviações do texto abaixo. Retorne apenas o texto corrigido, sem explicações.' },
      { role: 'user', content: pergunta },
    ], { temperature: 0, maxTokens: 100 })
    return resposta.content.trim() || pergunta
  } catch { return pergunta }
}

async function expandirPergunta(pergunta: string, contextoAnterior?: string): Promise<string> {
  try {
    const contexto = contextoAnterior
      ? `Contexto da conversa anterior: "${contextoAnterior}"\nPergunta atual: "${pergunta}"`
      : pergunta
    const resposta = await openAIChatCompletion([
      { role: 'system', content: 'Dado o texto abaixo, gere uma lista de 8 a 12 palavras-chave semânticas relacionadas ao tema. Retorne apenas as palavras separadas por espaço, sem pontuação.' },
      { role: 'user', content: contexto },
    ], { temperature: 0, maxTokens: 60 })
    const palavras = resposta.content.trim()
    return palavras ? `${pergunta} ${palavras}` : pergunta
  } catch { return pergunta }
}

async function gerarResumoHistorico(
  mensagens: Array<{ origem: string; conteudo: string | null; transcricao?: string | null }>
): Promise<string> {
  if (mensagens.length <= 10) return ''
  try {
    const texto = mensagens
      .slice(0, mensagens.length - 5)
      .map(m => `${m.origem === 'agente' ? 'Agente' : 'Cliente'}: ${m.transcricao || m.conteudo || ''}`)
      .join('\n')
    const resposta = await openAIChatCompletion([
      { role: 'system', content: 'Resuma em até 5 linhas os pontos principais desta conversa de atendimento: o problema do cliente, informações fornecidas e o que já foi resolvido. Seja objetivo e em português.' },
      { role: 'user', content: texto },
    ], { temperature: 0, maxTokens: 200 })
    return resposta.content.trim()
  } catch { return '' }
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
        end:   `${args.data}T${args.hora_fim}:00-03:00`,
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
        calendarConfig, evento.id,
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
  instanceName: string,
  // AJUSTE (F6-17): horário de funcionamento cadastrado na dashboard —
  // usado como fonte da janela de atendimento na consulta de disponibilidade.
  horarioInicio: string,
  horarioFim: string,
  diasFuncionamento: string[]
): Promise<string> {
  const supabase = createServiceClient()

  async function getCalConfig(): Promise<GoogleCalendarConfig | null> {
    const { data } = await supabase
      .from('agent_config')
      .select('google_calendar_config')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const cfg = data?.google_calendar_config as GoogleCalendarConfig | null
    if (!cfg?.client_email || !cfg?.private_key || !cfg?.calendar_id) return null
    return cfg
  }

  async function patchCalendarEvent(
    calConfig: GoogleCalendarConfig,
    eventId: string,
    body: Record<string, unknown>
  ): Promise<void> {
    const token = await getAccessToken(calConfig)
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calConfig.calendar_id)}/events/${eventId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Google Calendar PATCH falhou: ${JSON.stringify(err)}`)
    }
  }

  try {
    // AJUSTE (F6-17 / feedback Gabriel, item 3)
    // Fonte primária: tabela `appointments` + horário de funcionamento cadastrado.
    // Google Calendar entra apenas como verificação extra e NÃO bloqueante.
    if (toolName === 'listar_horarios_disponiveis_hubtek') {
      const dataRaw = String(args.data ?? 'hoje')
      const data    = dataRaw.match(/^\d{4}-\d{2}-\d{2}$/) ? dataRaw : parseDateFromText(dataRaw)
      const duracao = Number(args.duracao_minutos ?? 60)
      const profissionalFiltro = args.profissional ? String(args.profissional) : null

      // 1. Valida se a data cai em um dia de funcionamento cadastrado
      const diaSemana = DIAS_PT[new Date(`${data}T12:00:00-03:00`).getUTCDay()]
      if (!diasFuncionamento.includes(diaSemana)) {
        return `A empresa não atende em ${data} (fora dos dias de funcionamento cadastrados). Ofereça outra data ao cliente.`
      }

      // 2. Gera os slots possíveis dentro do horário de funcionamento
      const [hI, mI] = horarioInicio.split(':').map(Number)
      const [hF, mF] = horarioFim.split(':').map(Number)
      const inicioMin = hI * 60 + mI
      const fimMin    = hF * 60 + mF

      const slots: Array<{ inicio: number; fim: number }> = []
      for (let t = inicioMin; t + duracao <= fimMin; t += duracao) {
        slots.push({ inicio: t, fim: t + duracao })
      }
      if (slots.length === 0) return `Não há janela de atendimento configurada para ${data}.`

      const minutosParaMs = (min: number): number =>
        new Date(`${data}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00-03:00`).getTime()

      const ocupados: Array<{ inicio: number; fim: number }> = []

      // 3. FONTE PRIMÁRIA — agendamentos internos (aba Agendamentos da dashboard)
      const inicioDiaISO = new Date(`${data}T00:00:00-03:00`).toISOString()
      const fimDiaISO    = new Date(`${data}T23:59:59-03:00`).toISOString()

      const { data: agendamentos, error: agErr } = await supabase
        .from('appointments')
        .select('data_hora, profissional, status')
        .eq('tenant_id', tenantId)
        .not('status', 'eq', 'cancelado')
        .gte('data_hora', inicioDiaISO)
        .lte('data_hora', fimDiaISO)

      if (agErr) {
        console.error('[appointment tool] listar_horarios_disponiveis_hubtek:', agErr)
        return 'Erro ao consultar a agenda. Tente novamente.'
      }

      for (const ag of agendamentos ?? []) {
        // Se o cliente escolheu um profissional, só bloqueia os compromissos dele
        if (profissionalFiltro && ag.profissional && ag.profissional !== profissionalFiltro) continue
        const ini = new Date(ag.data_hora).getTime()
        ocupados.push({ inicio: ini, fim: ini + duracao * 60000 })
      }

      // 4. VERIFICAÇÃO EXTRA (opcional) — Google Calendar.
      //    Se não estiver integrado ou falhar, seguimos apenas com a fonte primária.
      let calendarConsultado = false
      try {
        const calConfig = await getCalConfig()
        if (calConfig) {
          const eventos = await listEventsByDay(calConfig, data)
          for (const ev of eventos) {
            const ini = new Date(ev.start).getTime()
            ocupados.push({ inicio: ini, fim: ini + duracao * 60000 })
          }
          calendarConsultado = true
        }
      } catch (calErr) {
        console.warn('[appointment tool] Consulta ao Google Calendar falhou (não crítico):', calErr)
      }

      // 5. Filtra slots ocupados e slots já passados (se for hoje)
      const agoraMs = Date.now()
      const livres = slots.filter(s => {
        const sIni = minutosParaMs(s.inicio)
        const sFim = minutosParaMs(s.fim)
        if (sIni <= agoraMs) return false
        return !ocupados.some(o => sIni < o.fim && sFim > o.inicio)
      })

      if (livres.length === 0) {
        return `Não há horários livres em ${data}${profissionalFiltro ? ` para ${profissionalFiltro}` : ''}. Ofereça outra data ao cliente.`
      }

      const lista = livres.map(s => {
        const h = String(Math.floor(s.inicio / 60)).padStart(2, '0')
        const m = String(s.inicio % 60).padStart(2, '0')
        return `• ${h}:${m}`
      }).join('\n')

      return `Horários livres em ${data}${profissionalFiltro ? ` com ${profissionalFiltro}` : ''}:\n${lista}\n(Fonte: agenda interna${calendarConsultado ? ' + Google Calendar' : ''}. Ofereça 2 destas opções ao cliente e aguarde a escolha dele.)`
    }

    if (toolName === 'criar_agendamento_hubtek') {
      const dataHora     = String(args.data_hora)
      const profissional = args.profissional ? String(args.profissional) : null

      // AJUSTE: verificação de conflito em TEMPO REAL antes de gravar.
      // Fecha a janela entre a consulta de disponibilidade e a criação —
      // se alguém ocupou o horário nesse meio tempo (pela dashboard ou
      // direto no Google Calendar), o agendamento é recusado aqui.
      const DURACAO_MS = 60 * 60 * 1000
      const inicioMs   = new Date(dataHora).getTime()
      const fimMs      = inicioMs + DURACAO_MS

      if (Number.isNaN(inicioMs)) return 'Data ou horário inválido. Peça ao cliente para confirmar o horário desejado.'

      // 1. Conflito na agenda interna (fonte primária)
      const { data: possiveisConflitos } = await supabase
        .from('appointments')
        .select('data_hora, profissional, contato_nome')
        .eq('tenant_id', tenantId)
        .not('status', 'eq', 'cancelado')
        .gte('data_hora', new Date(inicioMs - DURACAO_MS).toISOString())
        .lte('data_hora', new Date(fimMs).toISOString())

      const conflitoInterno = (possiveisConflitos ?? []).some(c => {
        // Se há profissional definido, só conflita com a agenda dele
        if (profissional && c.profissional && c.profissional !== profissional) return false
        const cIni = new Date(c.data_hora).getTime()
        return inicioMs < cIni + DURACAO_MS && fimMs > cIni
      })

      if (conflitoInterno) {
        return 'CONFLITO: este horário acabou de ser ocupado na agenda. NÃO confirme ao cliente. Consulte listar_horarios_disponiveis_hubtek novamente e ofereça outras opções.'
      }

      // 2. Conflito no Google Calendar (verificação extra, não bloqueante em caso de falha)
      let conflitoCalendar = false
      try {
        const calConfigCheck = await getCalConfig()
        if (calConfigCheck) {
          const dataStr = new Date(inicioMs - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const eventosDoDia = await listEventsByDay(calConfigCheck, dataStr)
          conflitoCalendar = eventosDoDia.some(ev => {
            // Ignora eventos já cancelados (marcados no título pelo próprio sistema)
            if (ev.summary?.startsWith('[CANCELADO]')) return false
            const eIni = new Date(ev.start).getTime()
            return inicioMs < eIni + DURACAO_MS && fimMs > eIni
          })
        }
      } catch (calErr) {
        console.warn('[appointment tool] Checagem de conflito no Calendar falhou (não crítico):', calErr)
      }

      if (conflitoCalendar) {
        return 'CONFLITO: este horário já está ocupado na agenda do Google Calendar. NÃO confirme ao cliente. Consulte listar_horarios_disponiveis_hubtek novamente e ofereça outras opções.'
      }

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          tenant_id:          tenantId,
          instance_name:      instanceName,
          contato_nome:       String(args.contato_nome),
          contato_telefone:   normalizarTelefone(String(args.contato_telefone)),
          servico:            String(args.servico),
          data_hora:          dataHora,
          // AJUSTE: a antecedência do lembrete é configuração do tenant
          // (tenants.lembrete_antecedencia_horas, lida pelo cron gerar-lembretes),
          // não decisão do agente. Grava-se o default apenas para manter a
          // coluna preenchida — o cron não usa este valor.
          antecedencia_horas: 24,
          status:             'pendente',
          profissional,
        })
        .select('id, data_hora')
        .single()
      if (error) { console.error('[appointment tool] criar_agendamento_hubtek:', error); return 'Erro ao criar agendamento. Tente novamente.' }
      try {
        const calConfig = await getCalConfig()
        if (calConfig) {
          const inicio = new Date(dataHora)
          const fim = new Date(inicio.getTime() + 60 * 60 * 1000)
          const fimISO = fim.toISOString().replace('Z', '-03:00').replace(/\.\d{3}/, '')
          const evento = await createEvent(calConfig, {
            summary: `${String(args.contato_nome)}${profissional ? ` — ${profissional}` : ''}`,
            start: dataHora,
            end: fimISO,
            description: [
              args.servico ? `Serviço: ${args.servico}` : '',
              profissional ? `Profissional: ${profissional}` : '',
              `Telefone: ${normalizarTelefone(String(args.contato_telefone))}`,
              `Agendado via agente IA`,
            ].filter(Boolean).join('\n'),
          })
          await supabase.from('appointments').update({ google_event_id: evento.id }).eq('id', data.id)
        }
      } catch (calErr) {
        console.error('[appointment tool] sync Calendar criar falhou (não crítico):', calErr)
      }
      const d = new Date(data.data_hora)
      const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
      const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
      return `Agendamento criado para ${args.contato_nome} em ${dataFmt} às ${horaFmt}${profissional ? ` com ${profissional}` : ''}.`
    }

    if (toolName === 'listar_agendamentos_cliente') {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, servico, data_hora, status, profissional')
        .eq('tenant_id', tenantId)
        .eq('contato_telefone', normalizarTelefone(String(args.contato_telefone)))
        .not('status', 'eq', 'cancelado')
        .order('data_hora', { ascending: true })
        .limit(5)
      if (error) { console.error('[appointment tool] listar_agendamentos_cliente:', error); return 'Erro ao buscar agendamentos.' }
      if (!data || data.length === 0) return 'Nenhum agendamento encontrado para este cliente.'
      const lista = data.map(a => {
        const d = new Date(a.data_hora)
        const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
        const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
        return `[ID:${a.id}] ${dataFmt} às ${horaFmt} — ${a.servico}${a.profissional ? ` — ${a.profissional}` : ''} (${a.status})`
      }).join('\n')
      return `Agendamentos encontrados:\n${lista}`
    }

    if (toolName === 'confirmar_agendamento') {
      const { data: appt } = await supabase
        .from('appointments')
        .select('google_event_id, contato_nome, profissional')
        .eq('id', String(args.appointment_id))
        .eq('tenant_id', tenantId)
        .maybeSingle()
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmado' })
        .eq('id', String(args.appointment_id))
        .eq('tenant_id', tenantId)
      if (error) { console.error('[appointment tool] confirmar_agendamento:', error); return 'Erro ao confirmar agendamento.' }
      try {
        const calConfig = await getCalConfig()
        if (calConfig && appt?.google_event_id) {
          await patchCalendarEvent(calConfig, appt.google_event_id, {
            summary: `✓ ${appt.contato_nome}${appt.profissional ? ` — ${appt.profissional}` : ''}`,
            colorId: '2',
          })
        }
      } catch (calErr) {
        console.error('[appointment tool] sync Calendar confirmar falhou (não crítico):', calErr)
      }
      return `Agendamento confirmado com sucesso.`
    }

    if (toolName === 'reagendar_agendamento_hubtek') {
      const novaDataHora = String(args.nova_data_hora)
      const { data: appt } = await supabase
        .from('appointments')
        .select('google_event_id, contato_nome, profissional')
        .eq('id', String(args.appointment_id))
        .eq('tenant_id', tenantId)
        .maybeSingle()
      const { error } = await supabase
        .from('appointments')
        .update({ data_hora: novaDataHora, status: 'pendente' })
        .eq('id', String(args.appointment_id))
        .eq('tenant_id', tenantId)
      if (error) { console.error('[appointment tool] reagendar_agendamento_hubtek:', error); return 'Erro ao reagendar agendamento.' }
      try {
        const calConfig = await getCalConfig()
        if (calConfig && appt?.google_event_id) {
          const inicio = new Date(novaDataHora)
          const fim = new Date(inicio.getTime() + 60 * 60 * 1000)
          await rescheduleEvent(calConfig, appt.google_event_id, novaDataHora, fim.toISOString())
        }
      } catch (calErr) {
        console.error('[appointment tool] sync Calendar reagendar falhou (não crítico):', calErr)
      }
      const d = new Date(novaDataHora)
      const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
      const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
      return `Agendamento reagendado com sucesso para ${dataFmt} às ${horaFmt}.`
    }

    if (toolName === 'cancelar_agendamento_hubtek') {
      const { data: appt } = await supabase
        .from('appointments')
        .select('google_event_id, contato_nome, profissional')
        .eq('id', String(args.appointment_id))
        .eq('tenant_id', tenantId)
        .maybeSingle()
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelado' })
        .eq('id', String(args.appointment_id))
        .eq('tenant_id', tenantId)
      if (error) { console.error('[appointment tool] cancelar_agendamento_hubtek:', error); return 'Erro ao cancelar agendamento.' }
      try {
        const calConfig = await getCalConfig()
        if (calConfig && appt?.google_event_id) {
          await patchCalendarEvent(calConfig, appt.google_event_id, {
            summary: `[CANCELADO] ${appt.contato_nome}${appt.profissional ? ` — ${appt.profissional}` : ''}`,
            colorId: '11',
          })
        }
      } catch (calErr) {
        console.error('[appointment tool] sync Calendar cancelar falhou (não crítico):', calErr)
      }
      return `Agendamento cancelado com sucesso.`
    }

    if (toolName === 'criar_recontato') {
      const { error } = await supabase.from('scheduled_tasks').insert({
        tenant_id:        tenantId,
        instance_name:    instanceName,
        contato_telefone: normalizarTelefone(String(args.contato_telefone)),
        contato_nome:     String(args.contato_nome),
        tipo:             'me_chama_depois',
        mensagem_inicial: String(args.mensagem_inicial),
        agendado_para:    String(args.agendado_para),
        status:           'pendente',
        criado_por:       null,
      })
      if (error) { console.error('[appointment tool] criar_recontato:', error); return 'Erro ao criar recontato.' }
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

// ─── Envio com presença + múltiplos blocos ────────────────────────────────────

async function enviarResposta(instanceName: string, phone: string, texto: string): Promise<void> {
  const blocos = quebrarEmBlocos(texto)
  for (let i = 0; i < blocos.length; i++) {
    const bloco = blocos[i]
    const delay = calcularDelayDigitacao(bloco)
    await sendPresence(instanceName, phone, delay)
    await new Promise(resolve => setTimeout(resolve, delay))
    await sendTextMessage(instanceName, phone, bloco)
    if (i < blocos.length - 1) await new Promise(resolve => setTimeout(resolve, 500))
  }
}

// ─── Escalar para humano ──────────────────────────────────────────────────────

async function escalarParaHumano(
  supabase: ReturnType<typeof createServiceClient>,
  conversationId: string,
  tenantId: string,
  motivo: 'solicitacao' | 'nao_resolvido'
): Promise<void> {
  try {
    await supabase
      .from('conversations')
      .update({ agente_pausado: true, atendente_id: null, atendente_nome: null, pausado_em: new Date().toISOString() })
      .eq('id', conversationId)

    const { data: conv } = await supabase
      .from('conversations')
      .select('contato_nome, contato_telefone')
      .eq('id', conversationId)
      .single()

    const nomeContato = conv?.contato_nome || conv?.contato_telefone || 'Cliente'

    const { data: usuarios } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .in('role', ['admin_hubtek', 'admin_tenant', 'self_managed', 'operador'])

    if (!usuarios || usuarios.length === 0) return

    const mensagem = motivo === 'solicitacao'
      ? `${nomeContato} solicitou atendimento humano.`
      : `${nomeContato} precisa de atendimento humano — o agente não conseguiu resolver.`

    await supabase.from('notifications').insert(
      usuarios.map((u) => ({
        user_id:   u.id,
        tenant_id: tenantId,
        tipo:      'atendimento_humano',
        titulo:    'Cliente aguardando atendimento',
        mensagem,
        metadata:  { conversation_id: conversationId, contato_nome: nomeContato, motivo },
        lida:      false,
      }))
    )
  } catch (err) {
    console.error('[process-message] escalarParaHumano falhou:', err)
  }
}

// ─── Classificação automática de etapa CRM ───────────────────────────────────

async function classificarEtapaCRM({
  tenantId,
  conversationId,
  funilTipo,
  historicoRecente,
  respostaAgente,
  mensagemCliente,
  agendamentoCriado,
}: {
  tenantId: string
  conversationId: string
  funilTipo: string
  historicoRecente: string
  respostaAgente: string
  mensagemCliente: string
  // AJUSTE (feedback Gabriel 15/07): indica se um agendamento foi REALMENTE
  // criado nesta interação. Sem isso o classificador avançava o lead para
  // "agendado" só porque o cliente perguntou sobre horários.
  agendamentoCriado: boolean
}): Promise<void> {
  const supabase = createServiceClient()

  const { data: leadAtual } = await supabase
    .from('crm_leads')
    .select('id, etapa')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!leadAtual) return

  const { ETAPAS_FUNIL } = await import('@/lib/crm')
  const etapas = ETAPAS_FUNIL[funilTipo] ?? []
  const etapasFinais = etapas.slice(-2)

  if (etapasFinais.includes(leadAtual.etapa)) return

  // AJUSTE: no funil de agendamentos, as etapas "agendado" e "confirmado" só
  // podem ser atingidas se um agendamento real foi criado no sistema.
  // Consultar horários mantém o lead em "interesse_identificado".
  const etapasBloqueadas: string[] = [...etapasFinais]
  if (funilTipo === 'agendamentos' && !agendamentoCriado) {
    etapasBloqueadas.push('agendado', 'confirmado')
  }

  try {
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

    const { choices } = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content: `Você analisa conversas de atendimento e decide se o lead avançou de etapa no funil de ${funilTipo}.
Etapas disponíveis em ordem: ${etapas.join(' → ')}
Etapa atual: ${leadAtual.etapa}

Regras:
- Responda APENAS com o nome exato de uma etapa da lista, ou "manter"
- Avance quando houver qualquer sinal de progressão — não exija certeza absoluta
- Exemplos de avanço em vendas: cliente pergunta sobre produtos/preços/opções = interesse_identificado; cliente pede proposta ou demonstra intenção de compra = proposta_enviada; cliente negocia condições = em_negociacao
- Exemplos de avanço em suporte: cliente descreve o problema = em_analise; cliente aguarda retorno = aguardando_cliente; problema encaminhado = em_resolucao
- Exemplos de avanço em agendamentos: cliente pergunta horários disponíveis = interesse_identificado; cliente teve um agendamento efetivamente registrado no sistema = agendado; cliente confirmou presença de um agendamento já registrado = confirmado
- ATENÇÃO no funil de agendamentos: perguntar sobre datas, horários ou disponibilidade NÃO é agendar. O lead só sai de interesse_identificado quando o agendamento foi de fato registrado no sistema.
- Exemplos de avanço em qualificacao: cliente responde perguntas iniciais = contato_realizado; cliente demonstra fit com o produto = qualificado; cliente mostra intenção clara = oportunidade
- Nunca vá para estas etapas automaticamente: ${etapasBloqueadas.join(', ')}
- Se realmente não houver progressão nenhuma, responda "manter"`,
        },
        {
          role: 'user',
          content: `Histórico recente:\n${historicoRecente}\n\nÚltima mensagem do cliente: ${mensagemCliente}\nResposta do agente: ${respostaAgente}\n\nQual deve ser a etapa agora?`,
        },
      ],
    })

    const novaEtapa = choices[0]?.message?.content?.trim().toLowerCase() ?? 'manter'

    if (
      novaEtapa === 'manter' ||
      novaEtapa === leadAtual.etapa ||
      !etapas.includes(novaEtapa) ||
      etapasBloqueadas.includes(novaEtapa)
    ) return

    await supabase
      .from('crm_leads')
      .update({
        etapa:          novaEtapa,
        etapa_anterior: leadAtual.etapa,
        movido_por:     'agente',
        atualizado_em:  new Date().toISOString(),
      })
      .eq('id', leadAtual.id)

    console.log(`[CRM] Lead ${leadAtual.id} avançou: ${leadAtual.etapa} → ${novaEtapa}`)
  } catch (err) {
    console.error('[CRM] classificarEtapaCRM falhou:', err)
  }
}

// ─── Upsert lead no CRM ───────────────────────────────────────────────────────

async function upsertCRMLead(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  conversationId: string,
  contatoNome: string | null,
  contatoTelefone: string,
  funilTipo: string,
): Promise<void> {
  try {
    const etapaInicial = ETAPA_INICIAL[funilTipo]
    if (!etapaInicial) return
    await supabase.from('crm_leads').upsert(
      {
        tenant_id:        tenantId,
        conversation_id:  conversationId,
        contato_nome:     contatoNome,
        contato_telefone: contatoTelefone,
        funil_tipo:       funilTipo,
        etapa:            etapaInicial,
        movido_por:       'agente',
        atualizado_em:    new Date().toISOString(),
      },
      {
        onConflict:       'conversation_id',
        ignoreDuplicates: true,
      }
    )
  } catch (err) {
    console.error('[process-message] upsertCRMLead falhou (não crítico):', err)
  }
}

// ─── processIncomingMessage ───────────────────────────────────────────────────

export async function processIncomingMessage(payload: ProcessMessagePayload): Promise<void> {
  const supabase = createServiceClient()

  const conversa = await reativarOuCriarConversa(
    supabase, payload.tenantId, payload.phone, payload.pushName, payload.instanceName
  )

  let tipoDb = 'texto'
  if (payload.messageType === 'audioMessage')         tipoDb = 'audio'
  else if (payload.messageType === 'imageMessage')    tipoDb = 'imagem'
  else if (payload.messageType === 'videoMessage')    tipoDb = 'video'
  else if (payload.messageType === 'documentMessage') tipoDb = 'documento'

  const mensagemSalva = await saveMessage(supabase, {
    conversationId: conversa.id,
    tenantId:       payload.tenantId,
    origem:         'cliente',
    tipo:           tipoDb,
    conteudo:       payload.conteudo,
    metadata:       { messageId: payload.messageId, pushName: payload.pushName },
  })

  await updateConversationTimestamp(supabase, conversa.id)

  const tenantAtivoGlobal = await isTenantAgentActive(supabase, payload.tenantId)
  if (!tenantAtivoGlobal) return

  const pausado = await isAgentPaused(supabase, conversa.id)
  if (pausado) return

  const config = await getAgentConfig(supabase, payload.tenantId)
  if (!config || !config.ativo) return

  // ─── CRM: extrai função principal e cria lead automaticamente ─────────────
  const configExtra     = config as unknown as Record<string, unknown>
  const funcoesAtivas   = (configExtra.funcoes_ativas as string[]) ?? []
  const funcaoPrincipal = funcoesAtivas[0] as FunilTipo | undefined

  if (funcaoPrincipal && FUNIS_VALIDOS.includes(funcaoPrincipal)) {
    upsertCRMLead(
      supabase,
      payload.tenantId,
      conversa.id,
      conversa.contato_nome ?? payload.pushName ?? null,
      payload.phone,
      funcaoPrincipal,
    ).catch(() => {})
  }
  // ──────────────────────────────────────────────────────────────────────────

  const dentroDoHorario = isWithinOperatingHours(config.horario_inicio, config.horario_fim, config.dias_funcionamento)
  if (!dentroDoHorario) {
    await sendTextMessage(payload.instanceName, payload.phone, config.mensagem_ausencia)
    return
  }

  let conteudoProcessado = payload.conteudo ?? ''

  if (payload.messageType === 'audioMessage') {
    try {
      const { base64, mimetype } = await downloadMediaAsBase64(payload.instanceName, payload.messageKey)
      const transcricao = await transcribeAudio(base64, mimetype)
      await updateMessageTranscription(supabase, mensagemSalva.id, transcricao)
      conteudoProcessado = transcricao
      try {
        const ext = mimetype.includes('ogg') ? 'ogg' : mimetype.includes('mp4') ? 'mp4' : 'webm'
        const path = `${payload.tenantId}/${Date.now()}_audio.${ext}`
        const buffer = Buffer.from(base64, 'base64')
        const { error: uploadErr } = await supabase.storage.from('mensagens-midia').upload(path, buffer, { contentType: mimetype })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('mensagens-midia').getPublicUrl(path)
          await supabase.from('messages').update({ arquivo_url: urlData.publicUrl }).eq('id', mensagemSalva.id)
        }
      } catch (uploadErr) {
        console.warn('[process-message] Upload áudio falhou (não crítico):', uploadErr)
      }
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
      try {
        const ext = mimetype.includes('png') ? 'png' : mimetype.includes('webp') ? 'webp' : 'jpg'
        const path = `${payload.tenantId}/${Date.now()}_img.${ext}`
        const buffer = Buffer.from(base64, 'base64')
        const { error: uploadErr } = await supabase.storage.from('mensagens-midia').upload(path, buffer, { contentType: mimetype })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('mensagens-midia').getPublicUrl(path)
          await supabase.from('messages').update({ arquivo_url: urlData.publicUrl }).eq('id', mensagemSalva.id)
        }
      } catch (uploadErr) {
        console.warn('[process-message] Upload imagem falhou (não crítico):', uploadErr)
      }
    } catch (err) {
      console.error('[process-message] Falha ao interpretar imagem:', err)
      conteudoProcessado = payload.caption || '[Imagem recebida]'
    }
  }

  if (!conteudoProcessado.trim()) return

  if (HUMANO_REGEX.test(conteudoProcessado)) {
    const msgTransferencia = 'Claro! Vou transferir você para um de nossos atendentes. Um momento, por favor. 🙋'
    await enviarResposta(payload.instanceName, payload.phone, msgTransferencia)
    await saveMessage(supabase, { conversationId: conversa.id, tenantId: payload.tenantId, origem: 'agente', tipo: 'texto', conteudo: msgTransferencia })
    await escalarParaHumano(supabase, conversa.id, payload.tenantId, 'solicitacao')
    await updateConversationTimestamp(supabase, conversa.id)
    return
  }

  const intencao = classificarIntencao(conteudoProcessado)

  const perfil = await buscarPerfilCliente(supabase, payload.tenantId, payload.phone)
  const perfilTexto = perfil
    ? [
        perfil.contato_nome ? `Nome: ${perfil.contato_nome}` : '',
        perfil.cidade ? `Cidade: ${perfil.cidade}` : '',
        perfil.preferencias && Object.keys(perfil.preferencias).length > 0
          ? `Preferências: ${Object.entries(perfil.preferencias)
              .filter(([k]) => !/(data|hora|agendamento|pizza|sabor|produto|pagamento|reagendamento)/i.test(k))
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')}`
          : '',
        perfil.historico_resumido ? `Histórico anterior: ${perfil.historico_resumido}` : '',
      ].filter(Boolean).join('\n')
    : ''

  if (payload.pushName) {
    salvarPerfilCliente(supabase, payload.tenantId, payload.phone, perfil, { nome: payload.pushName }).catch(() => {})
  }

  const historico         = await getRecentMessages(supabase, conversa.id, 20)
  const historicoResumido = await gerarResumoHistorico(historico)
  const historicoRecente  = historico.slice(-10)

  const totalMensagensCliente = historico.filter(m => m.origem === 'cliente').length
  if (deveExtrairPerfil(totalMensagensCliente)) {
    extrairPerfilDaConversa(historico)
      .then(async (extraido) => {
        if (!extraido) return
        const temDados = extraido.nome || extraido.cidade ||
          Object.keys(extraido.preferencias ?? {}).length > 0 || extraido.resumo_conversa
        if (!temDados) return
        await salvarPerfilCliente(supabase, payload.tenantId, payload.phone, perfil, {
          nome:            extraido.nome ?? undefined,
          cidade:          extraido.cidade ?? undefined,
          preferencias:    extraido.preferencias ?? {},
          resumo_conversa: extraido.resumo_conversa ?? undefined,
        })
        console.log(`[perfil] Atualizado para ${payload.phone} | msgs cliente: ${totalMensagensCliente}`)
      })
      .catch((err) => console.error('[perfil] Extração falhou (não crítico):', err))
  }

  let knowledgeDocs: Array<{ conteudo_texto: string; similarity: number; criado_em: string }> = []

  if (intencao !== 'saudacao') {
    try {
      const perguntaNormalizada = await normalizarPergunta(conteudoProcessado)
      const ultimaMsgAgente = historico.filter(m => m.origem === 'agente').slice(-1)[0]
      const contextoAnterior = ultimaMsgAgente?.conteudo ?? undefined
      const textoParaEmbedding = await expandirPergunta(perguntaNormalizada, contextoAnterior)
      const embedding = await generateEmbedding(textoParaEmbedding)
      const { data: docs, error: ragError } = await supabase.rpc('match_knowledge', {
        query_embedding:  embedding,
        match_tenant_id:  payload.tenantId,
        match_threshold:  0.35,
        match_count:      10,
      })
      if (ragError) console.error('[RAG] Erro no match_knowledge:', ragError)
      knowledgeDocs = ((docs ?? []) as Array<{ conteudo_texto: string; similarity: number; criado_em: string }>)
        .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
      console.log(`[RAG] ${knowledgeDocs.length} chunks | similarities: ${knowledgeDocs.map(d => d.similarity.toFixed(3)).join(', ')}`)
    } catch (err) {
      console.error('[RAG] Falha na busca semântica:', err)
    }
  }

  const calendarConfig        = configExtra.google_calendar_config as GoogleCalendarConfig | null
  const temCalendar           = !!(calendarConfig?.client_email && calendarConfig?.private_key && calendarConfig?.calendar_id)
  const temAgendamentosHubtek = funcoesAtivas.includes('agendamentos')

  const profissionaisDoTenant = temAgendamentosHubtek
    ? await getProfissionaisDoTenant(supabase, payload.tenantId)
    : []
  const feriadosProximosStr = getFeriadosProximos()

  // Detecta troca de funil: busca funil_tipo do lead existente desta conversa
  let funilAnterior: string | undefined
  if (funcaoPrincipal) {
    try {
      const { data: leadExistente } = await supabase
        .from('crm_leads')
        .select('funil_tipo')
        .eq('conversation_id', conversa.id)
        .maybeSingle()
      if (leadExistente?.funil_tipo && leadExistente.funil_tipo !== funcaoPrincipal) {
        funilAnterior = leadExistente.funil_tipo
        console.log(`[CRM] Transição de funil detectada: ${funilAnterior} → ${funcaoPrincipal}`)
      }
    } catch {
      // não crítico — segue sem instrução de transição
    }
  }

  const isPrimeiraMsg = historico.filter(m => m.origem === 'cliente').length === 1
  if (isPrimeiraMsg && config.prompt_principal) {
    const saudacao    = getSaudacao()
    const nomeCliente = payload.pushName ? `, ${payload.pushName.split(' ')[0]}` : ''
    const boasVindas  = `${saudacao}${nomeCliente}! 👋 Em que posso ajudar?`
    await enviarResposta(payload.instanceName, payload.phone, boasVindas)
    await saveMessage(supabase, { conversationId: conversa.id, tenantId: payload.tenantId, origem: 'agente', tipo: 'texto', conteudo: boasVindas })
    await updateConversationTimestamp(supabase, conversa.id)
    return
  }

  const chatMessages: ChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(
        config.prompt_principal ?? '',
        knowledgeDocs,
        temCalendar,
        temAgendamentosHubtek,
        config.horario_inicio,
        config.horario_fim,
        config.dias_funcionamento,
        payload.phone,
        intencao,
        perfilTexto,
        historicoResumido,
        profissionaisDoTenant,
        feriadosProximosStr,
        funcaoPrincipal,
        funilAnterior,
      ),
    },
    ...historicoRecente.slice(0, -1).map(m => ({
      role: (m.origem === 'agente' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.transcricao || m.conteudo || '',
    })),
    { role: 'user', content: conteudoProcessado },
  ]

  // AJUSTE (F6-17 / feedback Gabriel, item 3): a consulta de disponibilidade
  // do fluxo Hubtek agora é feita por listar_horarios_disponiveis_hubtek, que
  // já faz parte de APPOINTMENT_TOOLS e não depende do Google Calendar —
  // ela usa a agenda interna + horário de funcionamento cadastrado, e apenas
  // cruza com o Calendar como verificação extra quando ele estiver integrado.
  const toolsAtivas: Tool[] = []
  if (temAgendamentosHubtek) {
    toolsAtivas.push(...APPOINTMENT_TOOLS)
  } else if (temCalendar) {
    toolsAtivas.push(...CALENDAR_TOOLS)
  }

  const usarTools =
    toolsAtivas.length > 0 &&
    config.motor_ia_principal === 'openai' &&
    intencao !== 'saudacao' &&
    intencao !== 'fora_escopo'

  const temperaturaBase = Number(config.temperatura)
  const temperatura     = intencao === 'reclamacao' ? Math.min(temperaturaBase + 0.2, 1.0) : temperaturaBase
  const chatConfig      = { temperature: temperatura, maxTokens: config.max_tokens }

  const { data: ultimasMsgsAgente } = await supabase
    .from('messages')
    .select('conteudo')
    .eq('conversation_id', conversa.id)
    .eq('origem', 'agente')
    .order('criado_em', { ascending: false })
    .limit(2)

  const falhasConsecutivas = (ultimasMsgsAgente ?? []).filter(
    (m) => m.conteudo && FALHA_AGENTE_REGEX.test(m.conteudo)
  ).length

  let resultado: { content: string; tokensIn: number; tokensOut: number } | null = null
  let motorUsado             = config.motor_ia_principal
  let recontotoCriadoPorTool = false
  // AJUSTE (feedback Gabriel 15/07): rastreia se um agendamento foi de fato
  // registrado nesta interação — usado para travar o avanço do lead no CRM.
  let agendamentoCriadoPorTool = false

  try {
    if (usarTools) {
      let mensagensAcumuladas: ChatMessage[] = [...chatMessages]
      const MAX_RODADAS     = 5
      let rodada            = 0
      const toolsExecutadas = new Set<string>()

      while (rodada < MAX_RODADAS) {
        rodada++
        const respostaComTools = await openAIChatCompletionWithTools(
          mensagensAcumuladas,
          toolsAtivas as Parameters<typeof openAIChatCompletionWithTools>[1],
          chatConfig
        )

        if (respostaComTools.toolCalls && respostaComTools.toolCalls.length > 0) {
          const toolResults: ChatMessage[] = []
          const toolCallsTyped = respostaComTools.toolCalls as unknown as ToolCall[]

          for (const tc of toolCallsTyped) {
            // AJUSTE (bug quintuplicação 14/07): as tools do Google Calendar
            // (criar_agendamento, reagendar, cancelar_agendamento) não estavam
            // nesta lista. Sem a guarda, o modelo as chamava repetidamente e o
            // loop rodava até MAX_RODADAS (5), criando 5 eventos idênticos no
            // Google Calendar — depois importados pelo cron sync-calendar.
            const toolsUnicas = [
              'criar_agendamento_hubtek', 'cancelar_agendamento_hubtek',
              'reagendar_agendamento_hubtek', 'criar_recontato',
              'criar_agendamento', 'reagendar', 'cancelar_agendamento',
            ]
            if (toolsUnicas.includes(tc.function.name)) {
              if (toolsExecutadas.has(tc.function.name)) {
                console.warn(`[tools] Tool ${tc.function.name} já executada — bloqueando duplicata`)
                toolResults.push({
                  role:         'tool' as const,
                  content:      'Ação já executada anteriormente nesta conversa. Não execute novamente.',
                  tool_call_id: tc.id,
                } as ChatMessage)
                continue
              }
              toolsExecutadas.add(tc.function.name)
            }
            const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
            const isAppointmentTool = APPOINTMENT_TOOLS.some(t => t.function.name === tc.function.name)
            if (tc.function.name === 'criar_recontato') recontotoCriadoPorTool = true
            const toolResult = isAppointmentTool
              ? await executarAppointmentToolCall(
                  tc.function.name, args, payload.tenantId, payload.instanceName,
                  config.horario_inicio, config.horario_fim, config.dias_funcionamento
                )
              : await executarToolCall(tc.function.name, args, calendarConfig!, config.horario_inicio, config.horario_fim)

            // AJUSTE: só marca como criado se a tool realmente confirmou sucesso
            // (retornos de CONFLITO ou erro não contam).
            if (
              (tc.function.name === 'criar_agendamento_hubtek' || tc.function.name === 'criar_agendamento') &&
              /^Agendamento criado/i.test(toolResult)
            ) {
              agendamentoCriadoPorTool = true
            }
            toolResults.push({
              role:         'tool' as const,
              content:      toolResult,
              tool_call_id: tc.id,
            } as ChatMessage)
          }

          mensagensAcumuladas = [
            ...mensagensAcumuladas,
            { role: 'assistant', content: '', tool_calls: respostaComTools.toolCalls } as unknown as ChatMessage,
            ...toolResults,
          ]
        } else {
          resultado = {
            content:   respostaComTools.content,
            tokensIn:  respostaComTools.tokensIn,
            tokensOut: respostaComTools.tokensOut,
          }
          break
        }
      }

      if (!resultado) {
        resultado = await openAIChatCompletion(mensagensAcumuladas, chatConfig)
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
      resultado  = config.motor_ia_backup === 'anthropic'
        ? await anthropicChatCompletion(chatMessages, chatConfig)
        : await openAIChatCompletion(chatMessages, chatConfig)
    } catch (errBackup) {
      console.error(`[process-message] Motor backup (${config.motor_ia_backup}) também falhou:`, errBackup)
      return
    }
  }

  if (!resultado?.content) return

  const estaFalhando = FALHA_AGENTE_REGEX.test(resultado.content)
  if (estaFalhando && falhasConsecutivas >= 1) {
    const msgEscalada = 'Entendo que não consegui resolver sua dúvida. Vou encaminhar você para um atendente que poderá te ajudar melhor! 🙋'
    await enviarResposta(payload.instanceName, payload.phone, msgEscalada)
    await saveMessage(supabase, { conversationId: conversa.id, tenantId: payload.tenantId, origem: 'agente', tipo: 'texto', conteudo: msgEscalada })
    await escalarParaHumano(supabase, conversa.id, payload.tenantId, 'nao_resolvido')
    await updateConversationTimestamp(supabase, conversa.id)
    return
  }

  await saveMessage(supabase, {
    conversationId: conversa.id,
    tenantId:       payload.tenantId,
    origem:         'agente',
    tipo:           'texto',
    conteudo:       resultado.content,
    metadata:       { motor: motorUsado },
  })

  await enviarResposta(payload.instanceName, payload.phone, resultado.content)
  await updateConversationTimestamp(supabase, conversa.id)

  await logAiUsage(supabase, {
    tenantId:       payload.tenantId,
    conversationId: conversa.id,
    tokensIn:       resultado.tokensIn,
    tokensOut:      resultado.tokensOut,
    motor:          motorUsado,
    custoReais:     calcularCusto(motorUsado, resultado.tokensIn, resultado.tokensOut),
  })

  if (!recontotoCriadoPorTool) {
    detectarMeChama({
      mensagemCliente:  conteudoProcessado,
      conversationId:   conversa.id,
      tenantId:         payload.tenantId,
      instanceName:     payload.instanceName,
      contatoNome:      conversa.contato_nome ?? payload.pushName ?? payload.phone,
      contatoTelefone:  payload.phone,
    }).catch((err) => console.error('[process-message] detectarMeChama falhou:', err))
  }

  // ─── CRM: classifica etapa automaticamente após resposta ─────────────────
  if (funcaoPrincipal && FUNIS_VALIDOS.includes(funcaoPrincipal) && resultado?.content) {
    classificarEtapaCRM({
      tenantId:         payload.tenantId,
      conversationId:   conversa.id,
      funilTipo:        funcaoPrincipal,
      historicoRecente: historicoRecente.map(m =>
        `${m.origem === 'agente' ? 'Agente' : 'Cliente'}: ${m.transcricao || m.conteudo || ''}`
      ).join('\n'),
      respostaAgente:   resultado.content,
      mensagemCliente:  conteudoProcessado,
      agendamentoCriado: agendamentoCriadoPorTool,
    }).catch((err) => console.error('[process-message] classificarEtapaCRM falhou:', err))
  }
  // ─────────────────────────────────────────────────────────────────────────
}