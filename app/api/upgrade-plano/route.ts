// app/api/upgrade-plano/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PLANOS_MAP, PLANOS_ORDER, proximoPlano } from '@/lib/planos'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
  try {
    const { tenant_id } = await request.json()
    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id obrigatório' }, { status: 400 })
    }

    // Busca tenant atual
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, nome, plano, expira_em')
      .eq('id', tenant_id)
      .single()

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
    }

    const planoAtual = tenant.plano ?? 'essencial'
    const proximo = proximoPlano(planoAtual)

    if (!proximo) {
      // Já está no Elite — não faz upgrade, apenas notifica
      return NextResponse.json({
        upgraded: false,
        motivo: 'plano_maximo',
        plano_atual: planoAtual,
      })
    }

    // Conta conversas do ciclo atual (mês corrente)
    const agora = new Date()
    // UTC-3
    const agora3 = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
    const inicioMes = new Date(Date.UTC(agora3.getUTCFullYear(), agora3.getUTCMonth(), 1, 3, 0, 0))

    const { count } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .gte('criado_em', inicioMes.toISOString())

    const totalConversas = count ?? 0
    const limiteAtual = PLANOS_MAP[planoAtual]?.limite ?? 50

    // Só faz upgrade se realmente atingiu ou ultrapassou o limite
    if (totalConversas < limiteAtual) {
      return NextResponse.json({
        upgraded: false,
        motivo: 'limite_nao_atingido',
        plano_atual: planoAtual,
        conversas: totalConversas,
        limite: limiteAtual,
      })
    }

    // Verifica se já foi feito upgrade neste ciclo (evita upgrade em loop)
    const { data: upgradeRecente } = await supabaseAdmin
      .from('plan_upgrades')
      .select('id')
      .eq('tenant_id', tenant_id)
      .gte('criado_em', inicioMes.toISOString())
      .limit(1)

    if (upgradeRecente && upgradeRecente.length > 0) {
      return NextResponse.json({
        upgraded: false,
        motivo: 'ja_upgradado_neste_ciclo',
        plano_atual: planoAtual,
      })
    }

    // Faz o upgrade
    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({ plano: proximo.value })
      .eq('id', tenant_id)

    if (updateErr) {
      console.error('[upgrade-plano] Erro ao atualizar plano:', updateErr)
      return NextResponse.json({ error: 'Erro ao atualizar plano' }, { status: 500 })
    }

    // Registra o upgrade no log
    await supabaseAdmin
      .from('plan_upgrades')
      .insert({
        tenant_id,
        plano_anterior: planoAtual,
        plano_novo: proximo.value,
        conversas_no_momento: totalConversas,
        motivo: 'limite_atingido_automatico',
      })
      .throwOnError()
      .catch((e: unknown) => {
        // Tabela pode não existir ainda — apenas loga
        console.warn('[upgrade-plano] Tabela plan_upgrades não existe ainda:', e)
      })

    console.log(`[upgrade-plano] Tenant ${tenant.nome} (${tenant_id}): ${planoAtual} → ${proximo.value} (${totalConversas} conversas)`)

    return NextResponse.json({
      upgraded: true,
      plano_anterior: planoAtual,
      plano_novo: proximo.value,
      plano_novo_label: proximo.label,
      conversas: totalConversas,
      limite_anterior: limiteAtual,
      limite_novo: proximo.limite,
    })
  } catch (err) {
    console.error('[upgrade-plano] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
