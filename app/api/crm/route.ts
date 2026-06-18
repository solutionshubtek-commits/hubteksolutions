import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  ETAPAS_FUNIL,
  ETAPA_INICIAL,
  LABELS_ETAPA,
  ETAPAS_FINAIS,
} from '@/lib/crm'

// Re-exporta para compatibilidade (process-message.ts importa ETAPA_INICIAL daqui)
export { ETAPAS_FUNIL, ETAPA_INICIAL, LABELS_ETAPA }

// ─── GET /api/crm ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenant_id')
    if (!tenantId) return NextResponse.json({ error: 'tenant_id obrigatório' }, { status: 400 })

    const { data: leads, error } = await supabase
      .from('crm_leads')
      .select('id, conversation_id, contato_nome, contato_telefone, funil_tipo, etapa, etapa_anterior, movido_por, resumo, criado_em, atualizado_em')
      .eq('tenant_id', tenantId)
      .order('atualizado_em', { ascending: false })

    if (error) { console.error('[api/crm] GET error:', error); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ leads: leads ?? [] })
  } catch (err) {
    console.error('[api/crm] GET exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── PATCH /api/crm — move lead de etapa ─────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const body = await req.json() as {
      id: string
      etapa: string
      movido_por: 'agente' | 'humano'
      resumo?: string
    }
    const { id, etapa, movido_por, resumo } = body
    if (!id || !etapa || !movido_por) return NextResponse.json({ error: 'id, etapa e movido_por são obrigatórios' }, { status: 400 })

    const { data: leadAtual } = await supabase.from('crm_leads').select('etapa, funil_tipo').eq('id', id).single()
    if (!leadAtual) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    const etapasDoFunil = ETAPAS_FUNIL[leadAtual.funil_tipo] ?? []
    if (!etapasDoFunil.includes(etapa)) {
      return NextResponse.json({ error: `Etapa "${etapa}" inválida para o funil "${leadAtual.funil_tipo}"` }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      etapa,
      etapa_anterior: leadAtual.etapa,
      movido_por,
      atualizado_em: new Date().toISOString(),
    }
    if (resumo !== undefined) updateData.resumo = resumo

    const { data: updated, error } = await supabase.from('crm_leads').update(updateData).eq('id', id).select().single()
    if (error) { console.error('[api/crm] PATCH error:', error); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ lead: updated })
  } catch (err) {
    console.error('[api/crm] PATCH exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── POST /api/crm — troca função principal do tenant ────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const body = await req.json() as { tenant_id: string; novo_funil: string }
    const { tenant_id, novo_funil } = body
    if (!tenant_id || !novo_funil) return NextResponse.json({ error: 'tenant_id e novo_funil obrigatórios' }, { status: 400 })
    if (!ETAPAS_FUNIL[novo_funil]) return NextResponse.json({ error: `Funil "${novo_funil}" não existe` }, { status: 400 })

    const { data: leadsAtivos } = await supabase.from('crm_leads').select('id, funil_tipo, etapa').eq('tenant_id', tenant_id)

    if (leadsAtivos && leadsAtivos.length > 0) {
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
      }

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

    return NextResponse.json({
      ok: true,
      resetados: leadsAtivos?.filter(l => !(ETAPAS_FINAIS[l.funil_tipo] ?? []).includes(l.etapa)).length ?? 0,
    })
  } catch (err) {
    console.error('[api/crm] POST exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}