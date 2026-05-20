import { NextRequest, NextResponse } from 'next/server'
import { aguardarEObterMensagens, liberarLock, juntarMensagens } from '@/lib/ai/debounce'
import { processIncomingMessage } from '@/lib/ai/process-message'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantByInstanceName } from '@/lib/supabase/queries/conversations'
import { PLANOS_MAP } from '@/lib/planos'

// Segredo interno para garantir que só o webhook chama esta rota
const INTERNAL_SECRET = process.env.CRON_SECRET

async function verificarUpgradePlano(tenantId: string): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hubteksolutions.tech'
    await fetch(`${baseUrl}/api/upgrade-plano`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId }),
    })
  } catch (err) {
    console.error('[process-webhook] Erro ao verificar upgrade de plano:', err)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Valida segredo interno
  const secret = request.headers.get('x-internal-secret')
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: {
    tenantId: string
    phone: string
    instanceName: string
    timestamp: number
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { tenantId, phone, instanceName, timestamp } = body

  if (!tenantId || !phone || !instanceName || !timestamp) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  try {
    // Aguarda janela de debounce (5s) e tenta obter lock
    const mensagens = await aguardarEObterMensagens(tenantId, phone, timestamp)

    // null = outra instância ganhou o lock ou chegou mensagem mais nova
    if (!mensagens || mensagens.length === 0) {
      return NextResponse.json({ skipped: true })
    }

    const mensagemUnificada = juntarMensagens(mensagens)
    const pushName = mensagens.find(m => m.pushName)?.pushName

    console.log(`[debounce] ${mensagens.length} msg(s) acumuladas para ${phone} → processando como 1`)

    await processIncomingMessage({
      tenantId,
      instanceName,
      phone,
      pushName,
      messageId: mensagemUnificada.messageId,
      messageKey: mensagemUnificada.messageKey as unknown as Parameters<typeof processIncomingMessage>[0]['messageKey'],
      messageType: mensagemUnificada.tipo as Parameters<typeof processIncomingMessage>[0]['messageType'],
      conteudo: mensagemUnificada.conteudo,
      caption: mensagemUnificada.caption,
    })

    // Verifica upgrade de plano
    const supabase = createServiceClient()
    const tenant = await getTenantByInstanceName(supabase, instanceName)
    if (tenant) {
      const planoAtual = (tenant as { plano?: string }).plano ?? 'essencial'
      if (planoAtual !== 'elite') {
        const agora3 = new Date(Date.now() - 3 * 60 * 60 * 1000)
        const inicioMes = new Date(Date.UTC(agora3.getUTCFullYear(), agora3.getUTCMonth(), 1, 3, 0, 0))
        const { count } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('criado_em', inicioMes.toISOString())
        const totalConversas = count ?? 0
        const limiteAtual = PLANOS_MAP[planoAtual]?.limite ?? 50
        if (totalConversas >= limiteAtual) {
          verificarUpgradePlano(tenantId)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[process-webhook] Erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  } finally {
    await liberarLock(tenantId, phone)
  }
}