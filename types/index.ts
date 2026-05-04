export type UserRole = 'admin_hubtek' | 'admin_tenant' | 'operador' | 'self_managed'

export type AgentStatus = 'ativo' | 'pausado' | 'inativo'

export type WhatsAppStatus = 'conectado' | 'desconectado' | 'banido' | 'bloqueado'

export type ConversationStatus = 'ativo' | 'pausado' | 'encerrado'

export type MessageType = 'texto' | 'audio' | 'imagem' | 'video' | 'documento'

export type AIMotor = 'openai' | 'anthropic'

export interface Tenant {
  id: string
  nome: string
  slug: string
  whatsapp_number: string | null
  whatsapp_status: WhatsAppStatus
  status: string
  self_managed: boolean
  acesso_expira_em: string | null
  criado_em: string
  atualizado_em: string
}

export interface User {
  id: string
  tenant_id: string | null
  email: string
  nome: string | null
  role: UserRole
  ativo: boolean
  criado_em: string
}

export interface Conversation {
  id: string
  tenant_id: string
  contato_nome: string | null
  contato_telefone: string
  status: ConversationStatus
  agente_pausado: boolean
  pausado_por: string | null
  pausado_em: string | null
  criado_em: string
  ultima_mensagem_em: string
}

export interface Message {
  id: string
  conversation_id: string
  tenant_id: string
  origem: 'agente' | 'cliente'
  tipo: MessageType
  conteudo: string | null
  arquivo_url: string | null
  transcricao: string | null
  metadata: Record<string, unknown> | null
  criado_em: string
}

export interface AgentConfig {
  id: string
  tenant_id: string
  prompt_principal: string | null
  motor_ia_principal: AIMotor
  motor_ia_backup: AIMotor
  ativo: boolean
  horario_inicio: string
  horario_fim: string
  dias_funcionamento: string[]
  mensagem_ausencia: string
  temperatura: number
  max_tokens: number
  atualizado_em: string
}

export interface KnowledgeBase {
  id: string
  tenant_id: string
  nome_arquivo: string
  tipo: 'pdf' | 'docx' | 'txt' | 'xlsx'
  conteudo_texto: string | null
  tamanho_bytes: number | null
  criado_em: string
  atualizado_em: string
}

export interface AIUsage {
  id: string
  tenant_id: string
  ciclo_mes: number
  ciclo_ano: number
  tokens_entrada: number
  tokens_saida: number
  custo_estimado_reais: number
  motor_utilizado: string | null
  conversation_id: string | null
  criado_em: string
}

export interface AIUsageSummary {
  tenant_id: string
  ciclo_mes: number
  ciclo_ano: number
  total_tokens: number
  custo_total_reais: number
  total_conversas: number
}

export interface BillingCycle {
  id: string
  tenant_id: string
  mes: number
  ano: number
  total_tokens: number
  custo_total_reais: number
  total_conversas: number
  total_mensagens: number
  fechado: boolean
  fechado_em: string | null
  relatorio_url: string | null
  criado_em: string
}

export interface Appointment {
  id: string
  tenant_id: string
  conversation_id: string | null
  contato_nome: string | null
  contato_telefone: string | null
  data_hora: string
  servico: string | null
  status: 'agendado' | 'reagendado' | 'cancelado' | 'concluido'
  google_event_id: string | null
  criado_em: string
}
