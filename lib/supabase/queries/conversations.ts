import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentConfig, Conversation, Message } from '@/types'

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

export async function isAgentPaused(
  supabase: SupabaseClient,
  conversationId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('conversations')
    .select('agente_pausado')
    .eq('id', conversationId)
    .single()

  return data?.agente_pausado === true
}

export async function isTenantAgentActive(
  supabase: SupabaseClient,
  tenantId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('tenants')
    .select('agente_ativo, pausado_por_admin')
    .eq('id', tenantId)
    .single()

  if (!data) return false
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
