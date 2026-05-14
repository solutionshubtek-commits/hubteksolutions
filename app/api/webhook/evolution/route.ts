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
import { PLANOS_MAP } from '@/lib/planos'

const WHATSAPP_STATUS: Record<string, string> = {
  open: 'conectado',
  close: 'desconectado',
  connecting: 'desconectado',
}

// ─── Upgrade automático ───────────────────────────────────────────────────────
// Chama a API de upgrade de forma assíncrona (fire-and-forget)
// Não bloqueia o processamento da mensagem
async function verificarUpgradePlano(tenantId: string): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hubteksolutions.tech'
    await fetch(`${baseUrl}/api/upgrade-plano`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId }),
    })
  } catch (err) {
    // Nunca deixar falha de upgrade derrubar o webhook
    console.error('[webhook] Erro ao verificar upgrade de plano:', err)
  }
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

    // ── Mensagens enviadas pelo operador (fromMe) ──────────────────────────
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

    // ── Ignora grupos ──────────────────────────────────────────────────────
    if (data.key.remoteJid.includes('@g.us')) return response

    // ── Mensagem do cliente ────────────────────────────────────────────────
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

      // ── Verifica upgrade de plano após processar mensagem ─────────────
      // Só verifica se o tenant tem plano definido (exceto elite que não faz upgrade)
      const planoAtual = (tenant as { plano?: string }).plano ?? 'essencial'
      if (planoAtual !== 'elite') {
        // Conta conversas do mês para decidir se precisa checar
        // Checa apenas a cada N mensagens para reduzir carga (a cada 5 mensagens)
        // A API de upgrade tem sua própria verificação de limite
        const agora3 = new Date(Date.now() - 3 * 60 * 60 * 1000)
        const inicioMes = new Date(Date.UTC(agora3.getUTCFullYear(), agora3.getUTCMonth(), 1, 3, 0, 0))

        const { count } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('criado_em', inicioMes.toISOString())

        const totalConversas = count ?? 0
        const limiteAtual = PLANOS_MAP[planoAtual]?.limite ?? 50

        // Só dispara verificação se atingiu ou ultrapassou o limite
        if (totalConversas >= limiteAtual) {
          verificarUpgradePlano(tenant.id) // fire-and-forget
        }
      }
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
