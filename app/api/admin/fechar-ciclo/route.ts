import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  criarClienteServico,
  fecharCicloDoTenant,
  mesRefAtual,
} from '@/lib/billing/fechar-ciclo'

/**
 * Fechamento manual, disparado pela tela admin/visao-geral.
 *
 * A lógica vive em lib/billing/fechar-ciclo.ts porque o cron mensal
 * (/api/cron/fechar-ciclos) precisa exatamente do mesmo cálculo — fechar
 * adiantado pela tela e deixar o automático rodar têm que produzir a mesma
 * linha, senão o número depende de quem fechou.
 */
export async function POST(request: Request) {
  try {
    // Só admin_hubtek fecha ciclo. Antes a rota aceitava qualquer chamada com
    // um tenant_id no corpo — sem verificar sequer se havia sessão.
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const { data: userData } = await supabaseAuth
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    if (userData?.role !== 'admin_hubtek') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const tenantId: string | undefined = body.tenant_id
    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id obrigatório.' }, { status: 400 })
    }

    // `mes_ref` opcional (AAAA-MM) permite refazer um fechamento antigo. Sem
    // ele, fecha o mês corrente — que é o caso do botão "fechar adiantado".
    const mesRef: string = /^\d{4}-\d{2}$/.test(body.mes_ref ?? '')
      ? body.mes_ref
      : mesRefAtual()

    const resultado = await fecharCicloDoTenant(
      criarClienteServico(),
      tenantId,
      mesRef,
      { usuarioId: user.id, automatico: false }
    )

    return NextResponse.json({
      success: true,
      resumo: {
        tenant_nome:   resultado.tenant_nome,
        mes_ref:       resultado.mes_ref,
        conversas:     resultado.conversas,
        tokens:        resultado.tokens,
        custo_brl:     resultado.custo_brl.toFixed(2),
        valor_cobrado: resultado.valor_cobrado.toFixed(2),
        margem:        resultado.margem.toFixed(2),
      },
    })
  } catch (err) {
    console.error('[fechar-ciclo] falhou:', err)
    // Devolve o motivo real: a rota é admin-only e a mensagem genérica anterior
    // obrigava a caçar a causa no log da Vercel.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      { status: 500 }
    )
  }
}
