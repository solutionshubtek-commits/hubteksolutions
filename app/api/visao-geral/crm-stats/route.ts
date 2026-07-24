import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ETAPAS_FUNIL, LABELS_ETAPA } from '@/lib/crm'

// SEM revalidate — cache feito no client com localStorage + TTL 15min

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    // Duas formas de janela para os insights:
    //  - preset: ?periodo=1|7|30|90 (1 = dia vigente; clamp [1,90])
    //  - customizado: ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD (snapshot de intervalo)
    const inicioParam = searchParams.get('inicio')
    const fimParam = searchParams.get('fim')
    let inicioInsights: Date
    let fimInsights: Date | null = null
    let dias: number
    if (inicioParam && fimParam) {
      inicioInsights = new Date(`${inicioParam}T00:00:00`)
      fimInsights = new Date(`${fimParam}T23:59:59.999`)
      dias = Math.max(1, Math.round((fimInsights.getTime() - inicioInsights.getTime()) / 86400000))
    } else {
      const periodoParam = searchParams.get('periodo') ?? '30'
      dias = Math.min(Math.max(parseInt(periodoParam) || 30, 1), 90)
      inicioInsights = new Date()
      if (dias === 1) inicioInsights.setHours(0, 0, 0, 0)
      else inicioInsights.setDate(inicioInsights.getDate() - dias)
    }

    const cookieStore = cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()
    const { data: userData } = await supabase
      .from('users').select('tenant_id').eq('id', user.id).single()
    if (!userData?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

    const tid = userData.tenant_id

    // Funil ativo
    const { data: agentConfig } = await supabase
      .from('agent_config').select('funcoes_ativas').eq('tenant_id', tid).maybeSingle()
    const funcoesAtivas = (agentConfig?.funcoes_ativas as string[]) ?? []
    const funilAtivo = funcoesAtivas[0] ?? 'vendas'
    const etapas = ETAPAS_FUNIL[funilAtivo] ?? []
    const labels = LABELS_ETAPA[funilAtivo] ?? {}

    // Leads ativos por etapa — LEFT join para não perder leads
    const { data: leadsData } = await supabase
      .from('crm_leads')
      .select('etapa, conversation_id')
      .eq('tenant_id', tid)
      .eq('funil_tipo', funilAtivo)

    // Busca status das conversas separadamente para evitar problema do inner join
    const convIds = (leadsData ?? []).map(l => l.conversation_id).filter(Boolean)
    const convStatusMap: Record<string, string> = {}
    if (convIds.length > 0) {
      const { data: convsData } = await supabase
        .from('conversations')
        .select('id, status')
        .in('id', convIds)
      ;(convsData ?? []).forEach((c: { id: string; status: string }) => {
        convStatusMap[c.id] = c.status
      })
    }

    // Contagem por etapa — todas as etapas, só ativas
    const contagemEtapa: Record<string, number> = {}
    etapas.forEach(e => { contagemEtapa[e] = 0 })
    ;(leadsData ?? []).forEach((l: { etapa: string; conversation_id: string }) => {
      const status = convStatusMap[l.conversation_id]
      const ativa = status === 'ativa'
      if (ativa && contagemEtapa[l.etapa] !== undefined) {
        contagemEtapa[l.etapa]++
      }
    })

    const inicioISO = inicioInsights.toISOString()
    const fimISO = fimInsights ? fimInsights.toISOString() : null

    // Leads encerrados por movido_por no período
    let qEncerrados = supabase
      .from('crm_leads')
      .select('movido_por, etapa')
      .eq('tenant_id', tid)
      .eq('funil_tipo', funilAtivo)
      .in('etapa', etapas.slice(-2))
      .gte('atualizado_em', inicioISO)
    if (fimISO) qEncerrados = qEncerrados.lte('atualizado_em', fimISO)
    const { data: encerrados } = await qEncerrados

    let resolvidosIA = 0
    let resolvidosHumano = 0
    ;(encerrados ?? []).forEach((l: { movido_por: string; etapa: string }) => {
      if (l.movido_por === 'agente') resolvidosIA++
      else resolvidosHumano++
    })

    // Aguardando humano agora (estado atual — não depende do período)
    const { count: aguardandoHumano } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .eq('status', 'ativa')
      .eq('agente_pausado', true)

    // Transferências para humano no período — conta direto em conversations
    // (mais confiável que notifications que cria N registros por usuário)
    let qTransferidos = supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .eq('agente_pausado', true)
      .gte('pausado_em', inicioISO)
    if (fimISO) qTransferidos = qTransferidos.lte('pausado_em', fimISO)
    const { count: transferidosHumano } = await qTransferidos

    // Novas conversas com interação no período
    let qTotalPeriodo = supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .gte('ultima_mensagem_em', inicioISO)
    if (fimISO) qTotalPeriodo = qTotalPeriodo.lte('ultima_mensagem_em', fimISO)
    const { count: totalConversasPeriodo } = await qTotalPeriodo

    return NextResponse.json({
      funilAtivo,
      etapas,
      labels,
      contagemEtapa,
      resolvidosIA,
      resolvidosHumano,
      aguardandoHumano: aguardandoHumano ?? 0,
      transferidosHumano: transferidosHumano ?? 0,
      periodo: dias,
      totalConversasPeriodo: totalConversasPeriodo ?? 0,
    })
  } catch (err) {
    console.error('[crm-stats] erro:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}