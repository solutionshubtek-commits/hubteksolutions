import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  parseWebhookEvent,
  isMessageUpsertData,
  isConnectionUpdateData,
  extractPhone,
  extractTextContent,
} from '@/lib/evolution/webhook'
import { getTenantByInstanceName, HORAS_PAUSA_AUTOMATICA } from '@/lib/supabase/queries/conversations'
import { acumularMensagem, type MensagemAcumulada } from '@/lib/ai/debounce'

const WHATSAPP_STATUS: Record<string, string> = {
  open: 'conectado',
  close: 'desconectado',
  connecting: 'desconectado',
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Durante a rotação do segredo o valor anterior continua aceito, para que os
  // webhooks não sejam rejeitados na janela entre o deploy e a troca na Evolution.
  // Remova EVOLUTION_WEBHOOK_SECRET_ANTERIOR assim que a rotação terminar.
  const apikey = request.headers.get('apikey')
  const segredosAceitos = [
    process.env.EVOLUTION_WEBHOOK_SECRET,
    process.env.EVOLUTION_WEBHOOK_SECRET_ANTERIOR,
  ].filter((s): s is string => Boolean(s))

  if (!apikey || !segredosAceitos.includes(apikey)) {
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
        // O agente envia as respostas pela própria Evolution API, e algumas
        // configurações de instância ecoam essas mensagens de volta como
        // `fromMe: true`. Sem esta checagem, a resposta do agente seria
        // registrada como fala de operador e — pior — dispararia a pausa
        // automática abaixo, silenciando o agente logo após a primeira
        // resposta dele. Se o mesmo texto acabou de sair como 'agente' nesta
        // conversa, é eco, não um humano digitando.
        // A comparação é por conteúdo, não exata: o agente salva a resposta
        // inteira em uma linha, mas a envia fatiada em blocos por
        // `quebrarEmBlocos`, que ainda converte o Markdown para o formato do
        // WhatsApp. Cada bloco ecoado é, portanto, um pedaço normalizado do
        // texto salvo.
        const limiteEco = new Date(Date.now() - 2 * 60 * 1000).toISOString()
        const { data: recentesAgente } = await supabase
          .from('messages')
          .select('conteudo')
          .eq('conversation_id', convAtiva.id)
          .eq('origem', 'agente')
          .gte('criado_em', limiteEco)
          .order('criado_em', { ascending: false })
          .limit(5)

        const normalizar = (t: string) => t.replace(/[*_~`#]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
        const ecoNormalizado = normalizar(conteudo)
        const ehEcoDoAgente = (recentesAgente ?? []).some(
          m => ecoNormalizado.length > 0 && normalizar(m.conteudo ?? '').includes(ecoNormalizado)
        )

        if (ehEcoDoAgente) return response

        await supabase.from('messages').insert({
          conversation_id: convAtiva.id,
          tenant_id: tenant.id,
          origem: 'operador',
          conteudo,
          from_me: true,
          criado_em: new Date().toISOString(),
        })
        // Um operador respondeu pelo WhatsApp Web: ele assumiu a conversa, e o
        // agente precisa sair da frente. Antes disso o agente continuava
        // respondendo por cima do atendente — o cliente via duas vozes
        // diferentes na mesma conversa e o operador não tinha como impedir
        // sem abrir a dashboard.
        //
        // A pausa tem prazo (pausa_expira_em) para a conversa não ficar órfã
        // se o atendente esquecer de retomar. Pausa manual, feita na dashboard,
        // continua sem expiração.
        await supabase.from('conversations')
          .update({
            ultima_mensagem_em: new Date().toISOString(),
            agente_pausado: true,
            pausado_em: new Date().toISOString(),
            pausa_expira_em: new Date(Date.now() + HORAS_PAUSA_AUTOMATICA * 60 * 60 * 1000).toISOString(),
          })
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
        // Reabrir por iniciativa do operador também é assumir o atendimento:
        // quem retomou a conversa foi um humano, então o agente entra pausado
        // pela mesma janela.
        await supabase.from('conversations')
          .update({
            status: 'ativa',
            agente_pausado: true,
            pausado_em: new Date().toISOString(),
            pausa_expira_em: new Date(Date.now() + HORAS_PAUSA_AUTOMATICA * 60 * 60 * 1000).toISOString(),
            ultima_mensagem_em: new Date().toISOString(),
          })
          .eq('id', convEncerrada.id)

        await supabase.from('messages').insert({
          conversation_id: convEncerrada.id,
          tenant_id: tenant.id,
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

    const mensagemEntrada: MensagemAcumulada = {
      conteudo: extractTextContent(data) ?? '',
      tipo: data.messageType,
      caption: data.message.imageMessage?.caption,
      messageId: data.key.id,
      messageKey: data.key as unknown as Record<string, unknown>,
      pushName: data.pushName,
      timestamp: Date.now(),
    }

    // Acumula no Redis — só dispara process-webhook na primeira mensagem
    const { isFirst } = await acumularMensagem(tenant.id, phone, mensagemEntrada)

    console.log(`[webhook] isFirst=${isFirst} para ${phone}`)

    if (isFirst) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hubteksolutions.tech'
      console.log(`[webhook] Disparando process-webhook para ${phone}`)
      // Aguarda o fetch iniciar antes de retornar — garante que o Vercel não cancele a chamada
      await fetch(`${baseUrl}/api/agent/process-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.CRON_SECRET ?? '',
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          phone,
          instanceName: event.instance,
        }),
      }).then(() => {
        console.log(`[webhook] process-webhook disparado com sucesso para ${phone}`)
      }).catch(err => console.error('[webhook] Erro ao disparar process-webhook:', err))
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