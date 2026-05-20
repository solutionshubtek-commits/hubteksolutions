import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  parseWebhookEvent,
  isMessageUpsertData,
  isConnectionUpdateData,
  extractPhone,
  extractTextContent,
} from '@/lib/evolution/webhook'
import { getTenantByInstanceName } from '@/lib/supabase/queries/conversations'
import { acumularMensagem, type MensagemAcumulada } from '@/lib/ai/debounce'

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

    // ── Mensagens enviadas pelo operador via WhatsApp Web (fromMe) ─────────
    if (data.key.fromMe) {
      const isMidia = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(data.messageType)
      if (isMidia) return response

      const supabase = createServiceClient()
      const tenant = await getTenantByInstanceName(supabase, event.instance)
      if (!tenant) return response

      const phone = extractPhone(data.key.remoteJid)
      const conteudo = extractTextContent(data)
      if (!conteudo) return response

      const { data: convAtiva } = await supabase
        .from('conversations')
        .select('id, contato_telefone, status')
        .eq('tenant_id', tenant.id)
        .eq('contato_telefone', phone)
        .in('status', ['ativo', 'ativa'])
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (convAtiva) {
        await supabase.from('messages').insert({
          conversation_id: convAtiva.id,
          origem: 'operador',
          conteudo,
          from_me: true,
          criado_em: new Date().toISOString(),
        })
        await supabase.from('conversations')
          .update({ ultima_mensagem_em: new Date().toISOString() })
          .eq('id', convAtiva.id)
        return response
      }

      const { data: convEncerrada } = await supabase
        .from('conversations')
        .select('id, contato_telefone, status')
        .eq('tenant_id', tenant.id)
        .eq('contato_telefone', phone)
        .in('status', ['encerrada', 'encerrado'])
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (convEncerrada) {
        await supabase.from('conversations')
          .update({
            status: 'ativa',
            agente_pausado: false,
            ultima_mensagem_em: new Date().toISOString(),
          })
          .eq('id', convEncerrada.id)

        await supabase.from('messages').insert({
          conversation_id: convEncerrada.id,
          origem: 'operador',
          conteudo,
          from_me: true,
          criado_em: new Date().toISOString(),
        })
      }

      return response
    }

    // ── Ignora grupos ──────────────────────────────────────────────────────
    if (data.key.remoteJid.includes('@g.us')) return response

    // ── Mensagem do cliente — acumula e dispara processamento ─────────────
    const supabase = createServiceClient()
    const tenant = await getTenantByInstanceName(supabase, event.instance)
    if (!tenant) return response

    const phone = extractPhone(data.key.remoteJid)
    const timestampAtual = Date.now()

    const mensagemEntrada: MensagemAcumulada = {
      conteudo: extractTextContent(data) ?? '',
      tipo: data.messageType,
      caption: data.message.imageMessage?.caption,
      messageId: data.key.id,
      messageKey: data.key as unknown as Record<string, unknown>,
      pushName: data.pushName,
      timestamp: timestampAtual,
    }

    // Acumula no Redis
    await acumularMensagem(tenant.id, phone, mensagemEntrada)

    // Dispara rota de processamento — fire-and-forget (não aguarda resposta)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hubteksolutions.tech'
    fetch(`${baseUrl}/api/agent/process-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET ?? '',
      },
      body: JSON.stringify({
        tenantId: tenant.id,
        phone,
        instanceName: event.instance,
        timestamp: timestampAtual,
      }),
    }).catch(err => console.error('[webhook] Erro ao disparar process-webhook:', err))
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