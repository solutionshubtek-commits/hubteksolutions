import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ETAPAS_FUNIL, ETAPA_INICIAL, ETAPAS_FINAIS, LABELS_FUNIL } from '@/lib/crm'

// ─── POST /api/crm/trocar-funil ──────────────────────────────────────────────
// Troca a função principal do tenant, reseta leads ativos e notifica todos os usuários

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const body = await req.json() as {
      tenant_id: string
      novo_funil: string
      funil_anterior: string
      user_id: string
    }

    const { tenant_id, novo_funil, funil_anterior, user_id } = body

    if (!tenant_id || !novo_funil || !user_id) {
      return NextResponse.json({ error: 'tenant_id, novo_funil e user_id são obrigatórios' }, { status: 400 })
    }

    if (!ETAPAS_FUNIL[novo_funil]) {
      return NextResponse.json({ error: `Funil "${novo_funil}" inválido` }, { status: 400 })
    }

    // Busca todos os leads do tenant
    const { data: leadsAtivos } = await supabase
      .from('crm_leads')
      .select('id, funil_tipo, etapa')
      .eq('tenant_id', tenant_id)

    let resetados = 0

    if (leadsAtivos && leadsAtivos.length > 0) {
      // Leads NÃO encerrados → resetar para etapa inicial do novo funil
      const idsParaResetar = leadsAtivos
        .filter(l => !(ETAPAS_FINAIS[l.funil_tipo] ?? []).includes(l.etapa))
        .map(l => l.id)

      if (idsParaResetar.length > 0) {
        await supabase.from('crm_leads').update({
          funil_tipo:     novo_funil,
          etapa:          ETAPA_INICIAL[novo_funil],
          etapa_anterior: null,
          movido_por:     'humano',
          atualizado_em:  new Date().toISOString(),
        }).in('id', idsParaResetar)
        resetados = idsParaResetar.length
      }

      // Leads encerrados → só atualiza o funil_tipo, mantém etapa histórica
      const idsEncerrados = leadsAtivos
        .filter(l => (ETAPAS_FINAIS[l.funil_tipo] ?? []).includes(l.etapa))
        .map(l => l.id)

      if (idsEncerrados.length > 0) {
        await supabase.from('crm_leads').update({
          funil_tipo:    novo_funil,
          atualizado_em: new Date().toISOString(),
        }).in('id', idsEncerrados)
      }
    }

    // Busca todos os usuários do tenant para notificar
    const { data: usuarios } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('ativo', true)
      .in('role', ['admin_hubtek', 'admin_tenant', 'self_managed', 'operador'])

    if (usuarios && usuarios.length > 0) {
      const labelAnterior = LABELS_FUNIL[funil_anterior] ?? funil_anterior
      const labelNovo     = LABELS_FUNIL[novo_funil] ?? novo_funil

      const mensagem = resetados > 0
        ? `A função do agente foi alterada de "${labelAnterior}" para "${labelNovo}". ${resetados} lead${resetados !== 1 ? 's' : ''} ativo${resetados !== 1 ? 's' : ''} retornou${resetados !== 1 ? 'am' : ''} para a primeira etapa do novo funil. Leads encerrados mantiveram seu histórico.`
        : `A função do agente foi alterada de "${labelAnterior}" para "${labelNovo}". Nenhum lead ativo foi afetado.`

      await supabase.from('notifications').insert(
        usuarios.map(u => ({
          user_id:   u.id,
          tenant_id,
          tipo:      'troca_funil_crm',
          titulo:    `Funil CRM alterado: ${labelAnterior} → ${labelNovo}`,
          mensagem,
          metadata:  {
            funil_anterior,
            novo_funil,
            resetados,
            alterado_por: user_id,
          },
          lida: false,
        }))
      )
    }

    return NextResponse.json({ ok: true, resetados })
  } catch (err) {
    console.error('[api/crm/trocar-funil] exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── GET /api/crm/trocar-funil?tenant_id=XXX ─────────────────────────────────
// Retorna contagem de leads ativos que serão afetados pela troca

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenant_id')

    if (!tenantId) return NextResponse.json({ error: 'tenant_id obrigatório' }, { status: 400 })

    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, funil_tipo, etapa')
      .eq('tenant_id', tenantId)

    const leadsAtivos = (leads ?? []).filter(
      l => !(ETAPAS_FINAIS[l.funil_tipo] ?? []).includes(l.etapa)
    ).length

    return NextResponse.json({ leads_ativos: leadsAtivos })
  } catch (err) {
    console.error('[api/crm/trocar-funil] GET exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}