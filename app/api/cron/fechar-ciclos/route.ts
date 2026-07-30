import { NextRequest, NextResponse } from 'next/server'
import {
  criarClienteServico,
  fecharCicloDoTenant,
  mesRefAnterior,
} from '@/lib/billing/fechar-ciclo'

export const maxDuration = 300

/**
 * Fechamento automático de ciclo — roda na virada do mês.
 *
 * Fecha o mês ANTERIOR para todos os tenants. Roda no dia 1º, quando o mês já
 * terminou e o consumo está consolidado; fechar o mês corrente no dia 1º
 * pegaria um mês com um dia de dados.
 *
 * Convive com o fechamento adiantado feito pela tela: `fecharCicloDoTenant` faz
 * upsert em (tenant_id, mes_ref), então um ciclo já fechado manualmente é
 * apenas ATUALIZADO com os números finais do mês fechado — não duplica, e não
 * fica congelado num recorte parcial. Quem fecha adiantado no dia 28 e recebe o
 * automático no dia 1º termina com o número correto do mês inteiro.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabase = criarClienteServico()
  const mesRef = mesRefAnterior()

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, nome')

  if (error) {
    console.error('[cron fechar-ciclos] falha ao listar tenants:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const fechados: string[] = []
  const falhas: Array<{ tenant: string; erro: string }> = []

  // Sequencial de propósito: são poucos tenants e cada fechamento faz várias
  // consultas. Paralelizar aqui só aumentaria o pico de conexões no Supabase
  // sem ganho relevante — e um erro isolado não pode derrubar os demais.
  for (const t of tenants ?? []) {
    try {
      const r = await fecharCicloDoTenant(supabase, t.id, mesRef, { automatico: true })
      fechados.push(`${r.tenant_nome}: ${r.conversas} conversas, ${r.tokens} tokens`)
      console.log(
        `[cron fechar-ciclos] ${r.tenant_nome} ${mesRef} — ` +
        `conversas=${r.conversas} tokens=${r.tokens} custo=${r.custo_brl.toFixed(2)} margem=${r.margem.toFixed(2)}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      falhas.push({ tenant: t.nome, erro: msg })
      console.error(`[cron fechar-ciclos] ${t.nome} falhou:`, msg)
    }
  }

  // 207 quando houve falha parcial: o cron não "deu certo", mas também não
  // falhou por inteiro. Sem isso, uma falha isolada num tenant passaria como
  // sucesso no painel de crons da Vercel.
  return NextResponse.json(
    { mes_ref: mesRef, fechados: fechados.length, falhas },
    { status: falhas.length > 0 ? 207 : 200 }
  )
}
