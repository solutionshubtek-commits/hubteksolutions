import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Expiração diária dos lotes de crédito extra.
 *
 * Marca como `expirado` todo lote ativo que passou dos 90 dias. A RPC
 * `consumir_atendimento` já ignora vencidos por conta própria (`expira_em >
 * now()`), então isto NÃO é o que impede o consumo indevido — é o que mantém o
 * `status` verdadeiro para a dashboard e os relatórios. Sem este cron um lote
 * vencido continuaria aparecendo como "ativo" na tela do cliente, com saldo
 * que o agente nunca usaria.
 *
 * Roda cedo, antes do horário comercial: assim o cliente que abre a dashboard
 * de manhã já vê o saldo correto do dia.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const agora = new Date().toISOString()

  const { data: expirados, error } = await supabase
    .from('credito_pacotes')
    .update({ status: 'expirado' })
    .eq('status', 'ativo')
    .lt('expira_em', agora)
    .select('id, tenant_id, quantidade_restante')

  if (error) {
    console.error('[cron expirar-creditos] falha ao expirar lotes:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Crédito pago que o cliente não chegou a usar. Vale ficar visível no log:
  // número alto e recorrente é sinal de que estamos vendendo pacote grande
  // demais para o consumo real do cliente.
  const creditosPerdidos = (expirados ?? []).reduce(
    (soma, p) => soma + (p.quantidade_restante ?? 0), 0
  )

  for (const p of expirados ?? []) {
    if ((p.quantidade_restante ?? 0) > 0) {
      console.log(
        `[cron expirar-creditos] tenant=${p.tenant_id} lote=${p.id} ` +
        `expirou com ${p.quantidade_restante} crédito(s) não usados`
      )
    }
  }

  // Visibilidade do que vence na próxima semana. Só log, sem aviso ao cliente
  // ainda — a notificação de "seus créditos vão vencer" precisa de tela para
  // levar a algum lugar, e a dashboard de créditos é a etapa seguinte.
  const em7dias = new Date(Date.now() + 7 * 864e5).toISOString()
  const { data: aVencer } = await supabase
    .from('credito_pacotes')
    .select('tenant_id, quantidade_restante, expira_em')
    .eq('status', 'ativo')
    .gt('quantidade_restante', 0)
    .gte('expira_em', agora)
    .lt('expira_em', em7dias)

  if (aVencer?.length) {
    const total = aVencer.reduce((s, p) => s + (p.quantidade_restante ?? 0), 0)
    console.log(
      `[cron expirar-creditos] atenção: ${total} crédito(s) em ${aVencer.length} ` +
      `lote(s) vencem nos próximos 7 dias`
    )
  }

  console.log(
    `[cron expirar-creditos] ${expirados?.length ?? 0} lote(s) expirado(s), ` +
    `${creditosPerdidos} crédito(s) perdido(s)`
  )

  return NextResponse.json({
    expirados: expirados?.length ?? 0,
    creditos_perdidos: creditosPerdidos,
    vencem_em_7_dias: aVencer?.length ?? 0,
  })
}
