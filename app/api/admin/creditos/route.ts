import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { exigirAdminHubtek } from '@/lib/auth/admin'

// A fila existe para ser trabalhada agora; cache aqui mostraria pedido já
// aprovado como pendente e levaria a aprovar duas vezes.
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/creditos
 *
 * Fila de solicitações de crédito para a Hubtek. Pendentes primeiro, depois o
 * histórico recente — o admin precisa ver o que aprovou há pouco para não
 * reaprovar um pagamento que já liberou.
 */
export async function GET() {
  try {
    const guarda = await exigirAdminHubtek()
    if (guarda.erro) return guarda.erro

    const supabase = createServiceClient()

    const { data: solicitacoes, error } = await supabase
      .from('credito_solicitacoes')
      .select('id, tenant_id, quantidade, valor_total, tipo, status, solicitado_em, aprovado_em, pacote_id')
      .order('solicitado_em', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[admin/creditos] erro ao listar:', error)
      return NextResponse.json({ error: 'Erro ao carregar solicitações' }, { status: 500 })
    }

    // Nome do cliente numa consulta só, em vez de um join por linha.
    // Array.from em vez de spread: o target do tsconfig não permite iterar Set.
    const tenantIds = Array.from(new Set((solicitacoes ?? []).map(s => s.tenant_id)))
    const nomes: Record<string, string> = {}

    if (tenantIds.length) {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, nome, plano')
        .in('id', tenantIds)

      for (const t of tenants ?? []) nomes[t.id] = t.nome
    }

    const lista = (solicitacoes ?? []).map(s => ({
      ...s,
      tenant_nome: nomes[s.tenant_id] ?? 'Cliente removido',
    }))

    return NextResponse.json({
      pendentes: lista.filter(s => s.status === 'pendente'),
      historico: lista.filter(s => s.status !== 'pendente').slice(0, 30),
    })
  } catch (err) {
    console.error('[admin/creditos] erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
