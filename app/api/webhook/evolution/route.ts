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

    if (data.key.fromMe) {
      // Ignora mídias — já salvas pela rota enviar-midia
      const isMidia = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(data.messageType)
      if (isMidia) return response

      const supabase = createServiceClient()
      const tenant = await getTenantByInstanceName(supabase, event.instance)
      if (!tenant) return response

      const phone = extractPhone(data.key.remoteJid)
      const conteudo = extractTextContent(data)
      if (!conteudo) return response

      const { data: conv } = await supabase
        .from('conversations')
        .select('id, contato_telefone, status')
        .eq('tenant_id', tenant.id)
        .eq('contato_telefone', phone)
        .in('status', ['ativo', 'ativa'])
        .order('criado_em', { ascending: false })
        .limit(1)
        .single()

      if (!conv) return response

      await supabase.from('messages').insert({
        conversation_id: conv.id,
        origem: 'operador',
        conteudo,
        from_me: true,
        criado_em: new Date().toISOString(),
      })

      return response
    }

    if (data.key.remoteJid.includes('@g.us')) return response

    const supabase = createServiceClient()
    const tenant = await getTenantByInstanceName(supabase, event.instance)
    if (!tenant) return response

    const phone = extractPhone(data.key.remoteJid)

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
