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
    if (data.key.fromMe) return response
    if (data.key.remoteJid.includes('@g.us')) return response

    const supabase = createServiceClient()
    const tenant = await getTenantByInstanceName(supabase, event.instance)

    if (!tenant) {
      console.error(`[webhook/evolution] Nenhum tenant ativo para instância: ${event.instance}`)
      return response
    }

    const phone = extractPhone(data.key.remoteJid)

    processIncomingMessage({
      tenantId: tenant.id,
      instanceName: event.instance,
      phone,
      pushName: data.pushName,
      messageId: data.key.id,
      messageKey: data.key,
      messageType: data.messageType,
      conteudo: extractTextContent(data),
      caption: data.message.imageMessage?.caption,
    }).catch(err => console.error('[webhook/evolution] Erro no processamento:', err))
  }

  if (event.event === 'connection.update' && isConnectionUpdateData(event.data)) {
    const whatsapp_status = WHATSAPP_STATUS[event.data.state] ?? 'desconectado'
    const supabase = createServiceClient()

    // Atualiza status na tabela tenant_instances
    await supabase
      .from('tenant_instances')
      .update({ status: whatsapp_status })
      .eq('instance_name', event.instance)
  }

  return response
}
