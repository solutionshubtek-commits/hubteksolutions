import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  parseWebhookEvent,
  isMessageUpsertData,
  isConnectionUpdateData,
  extractPhone,
  extractTextContent,
} from '@/lib/evolution/webhook'
import { processIncomingMessage } from '@/lib/ai/process-message'
import { getTenantByInstanceName } from '@/lib/supabase/queries/conversations'

const WHATSAPP_STATUS: Record<string, string> = {
  open: 'conectado',
  close: 'desconectado',
  connecting: 'desconectado',
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apikey = request.headers.get('apikey')
  if (apikey !== process.env.EVOLUTION_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const event = parseWebhookEvent(body)
  if (!event) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const response = NextResponse.json({ received: true })

  if (event.event === 'messages.upsert' && isMessageUpsertData(event.data)) {
    const data = event.data

    console.log('[webhook] messages.upsert recebido', {
      fromMe: data.key.fromMe,
      remoteJid: data.key.remoteJid,
      messageType: data.messageType,
      conteudo: extractTextContent(data)?.slice(0, 50),
    })

    if (data.key.fromMe) {
  console.log('[webhook] fromMe=true — salvando sem processar')

  const supabase = createServiceClient()
  const tenant = await getTenantByInstanceName(supabase, event.instance)
  if (!tenant) return response

  const phone = extractPhone(data.key.remoteJid)
  const conteudo = extractTextContent(data)
  if (!conteudo) return response

  // Busca ou cria conversa
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('phone', phone)
    .in('status', ['ativo', 'ativa'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!conv) return response // sem conversa ativa, ignora

  await supabase.from('messages').insert({
    conversation_id: conv.id,
    origem: 'cliente',
    conteudo,
    message_id: data.key.id,
    from_me: true, // <-- adicionar
    created_at: new Date().toISOString(),
  })

  return response
}
    if (data.key.remoteJid.includes('@g.us')) {
      console.log('[webhook] Descartado: grupo')
      return response
    }

    const supabase = createServiceClient()
    const tenant = await getTenantByInstanceName(supabase, event.instance)
    if (!tenant) {
      console.log('[webhook] Descartado: tenant não encontrado para instance', event.instance)
      return response
    }

    const phone = extractPhone(data.key.remoteJid)
    console.log('[webhook] Processando mensagem do cliente', { phone, tenantId: tenant.id })

    try {
      await processIncomingMessage({
        tenantId: tenant.id,
        instanceName: event.instance,
        phone,
        pushName: data.pushName,
        messageId: data.key.id,
        messageKey: data.key,
        messageType: data.messageType,
        conteudo: extractTextContent(data),
        caption: data.message.imageMessage?.caption,
      })
      console.log('[webhook] Mensagem processada com sucesso', { phone })
    } catch (err) {
      console.error('[webhook/evolution] Erro no processamento:', err)
    }
  }

  if (event.event === 'connection.update' && isConnectionUpdateData(event.data)) {
    const { state, statusReason } = event.data
    const isBanned = state === 'close' && statusReason === 401
    const whatsapp_status = isBanned ? 'banido' : (WHATSAPP_STATUS[state] ?? 'desconectado')
    const supabase = createServiceClient()
    await supabase
      .from('tenant_instances')
      .update({ status: whatsapp_status, status_reason: statusReason ?? null })
      .eq('instance_name', event.instance)
  }

  return response
}
