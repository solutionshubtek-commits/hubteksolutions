import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ETAPAS_FUNIL, LABELS_ETAPA } from '@/lib/crm'

export const revalidate = 900 // cache 15 minutos

export async function GET() {
  try {
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

    // Funil ativo do tenant
    const { data: agentConfig } = await supabase
      .from('agent_config').select('funcoes_ativas').eq('tenant_id', tid).maybeSingle()
    const funcoesAtivas = (agentConfig?.funcoes_ativas as string[]) ?? []
    const funilAtivo = funcoesAtivas[0] ?? 'vendas'
    const etapas = ETAPAS_FUNIL[funilAtivo] ?? []
    const labels = LABELS_ETAPA[funilAtivo] ?? {}

    // Leads ativos por etapa (ignora conversa encerrada)
    const { data: leadsData } = await supabase
      .from('crm_leads')
      .select('etapa, conversations!inner(status)')
      .eq('tenant_id', tid)
      .eq('funil_tipo', funilAtivo)

    // Contagem por etapa — só conversas ativas
    const contagemEtapa: Record<string, number> = {}
    etapas.forEach(e => { contagemEtapa[e] = 0 })
    type LeadComConv = { etapa: string; conversations: { status: string } | null }
    ;(leadsData ?? []).forEach((l) => {
      const lead = l as unknown as LeadComConv
      const ativa = lead.conversations?.status === 'ativa'
      if (ativa && contagemEtapa[lead.etapa] !== undefined) {
        contagemEtapa[lead.etapa]++
      }
    })

    // Leads encerrados por movido_por (IA vs humano) — últimos 30 dias
    const trintaDias = new Date()
    trintaDias.setDate(trintaDias.getDate() - 30)
    const { data: encerrados } = await supabase
      .from('crm_leads')
      .select('movido_por, etapa')
      .eq('tenant_id', tid)
      .eq('funil_tipo', funilAtivo)
      .in('etapa', etapas.slice(-2)) // etapas finais
      .gte('atualizado_em', trintaDias.toISOString())

    let resolvidosIA = 0
    let resolvidosHumano = 0
    ;(encerrados ?? []).forEach((l: { movido_por: string; etapa: string }) => {
      if (l.movido_por === 'agente') resolvidosIA++
      else resolvidosHumano++
    })

    // Aguardando resposta humana (agente pausado)
    const { count: aguardandoHumano } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .eq('status', 'ativa')
      .eq('agente_pausado', true)

    // Insights de atendimento humano nos últimos 30 dias
    const { data: notifHumano } = await supabase
      .from('notifications')
      .select('id, metadata, criado_em')
      .eq('tenant_id', tid)
      .eq('tipo', 'atendimento_humano')
      .gte('criado_em', trintaDias.toISOString())
      .limit(100)

    // Deduplica por conversation_id (vários usuários recebem a mesma notificação)
    const convIdsHumano = new Set(
      (notifHumano ?? []).map((n: { metadata: { conversation_id?: string } | null }) =>
        n.metadata?.conversation_id
      ).filter(Boolean)
    )
    const transferidosHumano = convIdsHumano.size

    return NextResponse.json({
      funilAtivo,
      etapas,
      labels,
      contagemEtapa,
      resolvidosIA,
      resolvidosHumano,
      aguardandoHumano: aguardandoHumano ?? 0,
      transferidosHumano,
    })
  } catch (err) {
    console.error('[crm-stats] erro:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}