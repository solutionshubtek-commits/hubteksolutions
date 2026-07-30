import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { tenant_id, usuario_id } = await request.json()

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id obrigatório.' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const agora = new Date()
    const mesRef = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()

    // Busca dados do tenant
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('nome')
      .eq('id', tenant_id)
      .single()

    // Conta conversas do mês
    const { count: conversas } = await supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .gte('criado_em', inicioMes)

    // Soma tokens e custo do mês.
    //
    // Lia de `token_usage`, que foi criada na migration 003 e nunca recebeu um
    // insert — o agente sempre registrou consumo em `ai_usage` (logAiUsage, em
    // lib/supabase/queries/conversations.ts). Como a consulta voltava vazia,
    // TODO ciclo fechado até aqui foi gravado com tokens 0, custo 0 e
    // valor_cobrado 0. Ciclos já fechados precisam ser refeitos à mão.
    //
    // ai_usage não tem coluna tokens_total (é entrada + saída) e o custo já
    // está em reais, então a conversão por 5,8 que existia aqui saiu: mantê-la
    // inflaria o valor cobrado em 5,8x.
    const { data: tokenData } = await supabaseAdmin
      .from('ai_usage')
      .select('tokens_entrada, tokens_saida, custo_estimado_reais')
      .eq('tenant_id', tenant_id)
      .gte('criado_em', inicioMes)

    const tokens = (tokenData ?? []).reduce((s, r) => s + (r.tokens_entrada ?? 0) + (r.tokens_saida ?? 0), 0)
    const custoBrl = (tokenData ?? []).reduce((s, r) => s + Number(r.custo_estimado_reais ?? 0), 0)
    // A coluna custo_usd de ciclos_fechados é histórica; preenchida por
    // conversão reversa para não ficar zerada nos ciclos novos.
    const custoUsd = custoBrl / 5.8
    const valorCobrado = custoBrl * 3

    // Salva o ciclo fechado
    const { error: cicloErr } = await supabaseAdmin
      .from('ciclos_fechados')
      .insert({
        tenant_id,
        tenant_nome: tenant?.nome ?? '',
        mes_ref: mesRef,
        conversas: conversas ?? 0,
        tokens,
        custo_usd: custoUsd,
        custo_brl: custoBrl,
        valor_cobrado: valorCobrado,
        fechado_por: usuario_id ?? null,
      })

    if (cicloErr) {
      return NextResponse.json({ error: cicloErr.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      resumo: {
        tenant_nome: tenant?.nome,
        mes_ref: mesRef,
        conversas: conversas ?? 0,
        tokens,
        custo_brl: custoBrl.toFixed(2),
        valor_cobrado: valorCobrado.toFixed(2),
      }
    })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
