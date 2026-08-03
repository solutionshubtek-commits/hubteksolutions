import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentConfig, Conversation, Message } from '@/types'
import { podeOperar } from '@/lib/ciclo-vida'

export async function getTenantBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'ativo')
    .maybeSingle()

  return data as { id: string } | null
}

export async function getTenantByInstanceName(
  supabase: SupabaseClient,
  instanceName: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('tenant_instances')
    .select('tenant_id, tenants!inner(id, status)')
    .eq('instance_name', instanceName)
    .eq('tenants.status', 'ativo')
    .maybeSingle()

  if (!data) return null
  return { id: data.tenant_id }
}

export async function findOrCreateConversation(
  supabase: SupabaseClient,
  tenantId: string,
  phone: string,
  nome?: string,
  instanceName?: string
): Promise<Conversation> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contato_telefone', phone)
    .eq('instance_name', instanceName ?? '')
    .neq('status', 'encerrado')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing as Conversation

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      contato_telefone: phone,
      contato_nome: nome ?? null,
      instance_name: instanceName ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar conversa: ${error.message}`)
  return created as Conversation
}

// Janela padrão da pausa automática disparada quando um operador assume a
// conversa pelo WhatsApp Web. Depois disso o agente volta sozinho, para que
// uma conversa não fique órfã caso o atendente esqueça de retomá-la.
export const HORAS_PAUSA_AUTOMATICA = 6

export async function isAgentPaused(
  supabase: SupabaseClient,
  conversationId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('conversations')
    .select('agente_pausado, pausa_expira_em')
    .eq('id', conversationId)
    .single()

  if (data?.agente_pausado !== true) return false

  // pausa_expira_em nulo = pausa manual da dashboard, sem prazo para acabar.
  const expiraEm = (data as { pausa_expira_em?: string | null }).pausa_expira_em
  if (!expiraEm) return true

  if (new Date(expiraEm).getTime() > Date.now()) return true

  // A pausa automática venceu — o agente reassume e o estado é normalizado no
  // banco, para que a dashboard reflita a retomada.
  await supabase
    .from('conversations')
    .update({ agente_pausado: false, pausado_em: null, pausa_expira_em: null })
    .eq('id', conversationId)

  return false
}

/**
 * Gate global do agente para o tenant.
 *
 * Passou a considerar os dois eixos de estado, que antes ficavam de fora:
 *
 *  - `status_comercial` — cliente cancelado ou arquivado não atende mais.
 *    Antes, "bloquear acesso" na tela admin não tinha nenhum efeito aqui e o
 *    agente seguia respondendo normalmente.
 *
 *  - `expira_em` — plano vencido não atende. O cron `verificar-expiracao` roda
 *    às 09h e é quem pausa de fato; esta checagem é a rede de segurança da
 *    janela entre a virada do vencimento e a execução do cron (e do caso em que
 *    o cron falha). Sem ela, um cliente vencido continuaria sendo atendido por
 *    até um dia inteiro.
 */
export async function isTenantAgentActive(
  supabase: SupabaseClient,
  tenantId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tenants')
    .select('agente_ativo, pausado_por_admin, status_comercial, expira_em')
    .eq('id', tenantId)
    .single()

  // Rede de proteção de ordem de deploy: se o código subir antes da migration
  // 010, `status_comercial` não existe, o PostgREST devolve erro, `data` vem
  // nulo e o retorno seria `false` — ou seja, agente derrubado para TODOS os
  // tenants de uma vez. Nesse caso específico, recai na consulta antiga: o
  // comportamento fica igual ao de hoje, nunca pior.
  if (error) {
    const { data: legado } = await supabase
      .from('tenants')
      .select('agente_ativo, pausado_por_admin')
      .eq('id', tenantId)
      .single()

    if (!legado) return false
    if (legado.pausado_por_admin) return false
    return legado.agente_ativo ?? true
  }

  if (!data) return false
  if (!podeOperar(data)) return false
  if (data.pausado_por_admin) return false
  return data.agente_ativo ?? true
}

export async function getAgentConfig(
  supabase: SupabaseClient,
  tenantId: string
): Promise<AgentConfig | null> {
  const { data } = await supabase
    .from('agent_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return data as AgentConfig | null
}

export async function getRecentMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 10
): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select('id, conversation_id, tenant_id, origem, tipo, conteudo, transcricao, arquivo_url, metadata, criado_em')
    .eq('conversation_id', conversationId)
    .order('criado_em', { ascending: false })
    .limit(limit)

  return ((data ?? []) as Message[]).reverse()
}

export async function saveMessage(
  supabase: SupabaseClient,
  data: {
    conversationId: string
    tenantId: string
    origem: 'agente' | 'cliente'
    tipo: string
    conteudo?: string
    arquivoUrl?: string
    transcricao?: string
    metadata?: Record<string, unknown>
  }
): Promise<Message> {
  const { data: saved, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: data.conversationId,
      tenant_id: data.tenantId,
      origem: data.origem,
      tipo: data.tipo,
      conteudo: data.conteudo ?? null,
      arquivo_url: data.arquivoUrl ?? null,
      transcricao: data.transcricao ?? null,
      metadata: data.metadata ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao salvar mensagem: ${error.message}`)
  return saved as Message
}

export async function updateMessageTranscription(
  supabase: SupabaseClient,
  messageId: string,
  transcricao: string
): Promise<void> {
  await supabase
    .from('messages')
    .update({ transcricao })
    .eq('id', messageId)
}

export async function updateConversationTimestamp(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  await supabase
    .from('conversations')
    .update({ ultima_mensagem_em: new Date().toISOString() })
    .eq('id', conversationId)
}

export async function logAiUsage(
  supabase: SupabaseClient,
  data: {
    tenantId: string
    conversationId: string
    tokensIn: number
    tokensOut: number
    motor: string
    custoReais: number
  }
): Promise<void> {
  const agora = new Date()
  await supabase.from('ai_usage').insert({
    tenant_id: data.tenantId,
    conversation_id: data.conversationId,
    ciclo_mes: agora.getMonth() + 1,
    ciclo_ano: agora.getFullYear(),
    tokens_entrada: data.tokensIn,
    tokens_saida: data.tokensOut,
    custo_estimado_reais: data.custoReais,
    motor_utilizado: data.motor,
  })
}

// Status encerrados — cobre variações históricas do banco
const STATUS_ENCERRADOS = ['encerrada', 'encerrado']

export async function reativarOuCriarConversa(
  supabase: SupabaseClient,
  tenantId: string,
  phone: string,
  nome?: string,
  instanceName?: string
): Promise<Conversation> {
  // 1. Busca conversa ativa (qualquer status não encerrado)
  const { data: ativa } = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contato_telefone', phone)
    .eq('instance_name', instanceName ?? '')
    .not('status', 'in', `(${STATUS_ENCERRADOS.map(s => `"${s}"`).join(',')})`)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (ativa) return ativa as Conversation

  // 2. Busca conversa encerrada mais recente para reabrir
  const { data: encerrada } = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contato_telefone', phone)
    .eq('instance_name', instanceName ?? '')
    .in('status', STATUS_ENCERRADOS)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (encerrada) {
    // Reabre a conversa existente
    const { data: reaberta, error } = await supabase
      .from('conversations')
      .update({
        status: 'ativa',
        agente_pausado: false,
        // Zera o prazo junto com a pausa: sem isso a conversa reaberta ficaria
        // com um pausa_expira_em vencido de um atendimento antigo.
        pausa_expira_em: null,
        ultima_mensagem_em: new Date().toISOString(),
      })
      .eq('id', encerrada.id)
      .select()
      .single()

    if (!error && reaberta) {
      console.log(`[conversa] Reaberta conversa ${encerrada.id} para ${phone}`)
      return reaberta as Conversation
    }
  }

  // 3. Nenhuma conversa existe — cria nova
  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      contato_telefone: phone,
      contato_nome: nome ?? null,
      instance_name: instanceName ?? null,
      status: 'ativa',
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar conversa: ${error.message}`)
  return created as Conversation
}