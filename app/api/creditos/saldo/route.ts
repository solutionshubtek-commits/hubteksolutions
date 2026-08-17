import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { exigirUsuarioComTenant } from '@/lib/auth/tenant'
import { getSaldo, getCicloRef } from '@/lib/creditos'

// Saldo muda a cada atendimento — cachear aqui mostraria número velho na tela
// justamente quando o cliente está perto do limite e precisa decidir comprar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/creditos/saldo
 *
 * Franquia restante do ciclo + créditos extras válidos, para os cards da
 * dashboard. Qualquer usuário do tenant pode consultar: é informação do
 * próprio plano, e o operador precisa saber que o limite está perto de acabar.
 *
 * ATENÇÃO — durante o modo sombra (etapa 3) o ledger ainda não recebeu o
 * backfill do ciclo vigente (etapa 4), então `franquiaUsada` aqui conta apenas
 * os atendimentos registrados a partir do deploy do shadow. Só exibir esses
 * números ao cliente depois do backfill.
 */
export async function GET() {
  try {
    const guarda = await exigirUsuarioComTenant()
    if (guarda.erro) return guarda.erro

    const supabase = createServiceClient()

    const { data: tenant } = await supabase
      .from('tenants')
      .select('plano')
      .eq('id', guarda.tenantId)
      .single()

    const plano = (tenant as { plano?: string } | null)?.plano ?? 'essencial'
    const saldo = await getSaldo(guarda.tenantId, plano, supabase)

    // Os lotes vão junto para a tela poder avisar "30 créditos vencem em 12
    // dias" — sem isso o cliente só descobre a validade quando o saldo some.
    const { data: pacotes } = await supabase
      .from('credito_pacotes')
      .select('id, quantidade_total, quantidade_restante, expira_em, ativado_em')
      .eq('tenant_id', guarda.tenantId)
      .eq('status', 'ativo')
      .gt('expira_em', new Date().toISOString())
      .order('expira_em', { ascending: true })

    return NextResponse.json({
      ciclo: getCicloRef(),
      plano,
      ...saldo,
      pacotes: pacotes ?? [],
    })
  } catch (err) {
    console.error('[creditos/saldo] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
