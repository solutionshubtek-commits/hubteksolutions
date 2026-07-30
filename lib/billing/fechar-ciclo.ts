import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PLANOS_MAP } from '@/lib/planos'

export const CUSTO_INSTANCIA_EXTRA = 67.0

export interface ResultadoFechamento {
  tenant_id: string
  tenant_nome: string
  mes_ref: string
  conversas: number
  tokens: number
  custo_brl: number
  custo_fixo_rateado: number
  valor_plano: number
  instancias_extras: number
  receita_inst_extras: number
  valor_cobrado: number
  margem: number
}

export function criarClienteServico(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** 'AAAA-MM' do mês corrente em UTC — mesmo fuso em que ai_usage.ciclo_mes é gravado. */
export function mesRefAtual(base = new Date()): string {
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 'AAAA-MM' do mês anterior ao informado. */
export function mesRefAnterior(base = new Date()): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1))
  return mesRefAtual(d)
}

function intervaloDoMes(mesRef: string): { inicio: string; fim: string } {
  const [ano, mes] = mesRef.split('-').map(Number)
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)).toISOString(),
    fim:    new Date(Date.UTC(ano, mes, 1)).toISOString(),
  }
}

/**
 * Fecha o ciclo de um tenant num mês de referência.
 *
 * Idempotente: faz upsert em (tenant_id, mes_ref). Fechar duas vezes atualiza a
 * mesma linha em vez de duplicar — o que importa agora que o ciclo pode ser
 * fechado adiantado pela tela E automaticamente pelo cron na virada do mês.
 *
 * O que cada número significa, porque isto estava trocado antes:
 *   - `custo_brl`     = o que a operação GASTOU de API no mês (ai_usage).
 *   - `valor_plano`   = a mensalidade contratada do cliente.
 *   - `valor_cobrado` = o que o cliente PAGA. É o valor do plano.
 *
 * A versão anterior gravava `valor_cobrado = custo_brl * 3`, uma marcação sobre
 * o custo. Mas admin/relatorios lê esse campo como o valor do plano (rotula a
 * coluna "Plano"), então o relatório exibia ~R$ 18 no lugar de uma mensalidade
 * de R$ 397 a R$ 3.500.
 */
export async function fecharCicloDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
  mesRef: string,
  opcoes: { usuarioId?: string | null; automatico?: boolean } = {}
): Promise<ResultadoFechamento> {
  const { inicio, fim } = intervaloDoMes(mesRef)

  const { data: tenant } = await supabase
    .from('tenants')
    .select('nome, plano')
    .eq('id', tenantId)
    .single()

  const planoKey = (tenant?.plano as string) ?? 'essencial'
  const valorPlano = PLANOS_MAP[planoKey]?.valor ?? PLANOS_MAP.essencial.valor

  // Conversas ABERTAS no mês.
  const { count: conversas } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('criado_em', inicio)
    .lt('criado_em', fim)

  // Consumo de IA do mês. Lê ai_usage — token_usage nunca recebeu um insert
  // sequer e era a origem dos relatórios zerados.
  const { data: uso } = await supabase
    .from('ai_usage')
    .select('tokens_entrada, tokens_saida, custo_estimado_reais')
    .eq('tenant_id', tenantId)
    .gte('criado_em', inicio)
    .lt('criado_em', fim)

  const tokens = (uso ?? []).reduce(
    (s, r) => s + (r.tokens_entrada ?? 0) + (r.tokens_saida ?? 0), 0
  )
  const custoBrl = (uso ?? []).reduce(
    (s, r) => s + Number(r.custo_estimado_reais ?? 0), 0
  )

  // Instâncias extras: da 2ª em diante. São RECEITA (o cliente paga por elas).
  const { count: totalInstancias } = await supabase
    .from('tenant_instances')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  const instanciasExtras = Math.max(0, (totalInstancias ?? 0) - 1)
  const receitaInstExtras = instanciasExtras * CUSTO_INSTANCIA_EXTRA

  // Custo fixo rateado, congelado no fechamento. O rateio muda quando entra ou
  // sai cliente; recalcular depois daria um número diferente do que valia aqui.
  const custoFixoRateado = await calcularCustoFixoRateado(supabase, mesRef)

  const margem = valorPlano + receitaInstExtras - custoBrl - custoFixoRateado

  const linha = {
    tenant_id:            tenantId,
    tenant_nome:          tenant?.nome ?? '',
    mes_ref:              mesRef,
    conversas:            conversas ?? 0,
    tokens,
    custo_brl:            custoBrl,
    // Coluna histórica; preenchida por conversão reversa para não ficar zerada.
    custo_usd:            custoBrl / 5.8,
    custo_fixo_rateado:   custoFixoRateado,
    plano:                planoKey,
    valor_plano:          valorPlano,
    instancias_extras:    instanciasExtras,
    receita_inst_extras:  receitaInstExtras,
    valor_cobrado:        valorPlano,
    fechado_por:          opcoes.usuarioId ?? null,
    fechado_automatico:   opcoes.automatico ?? false,
    fechado_em:           new Date().toISOString(),
  }

  const { error } = await supabase
    .from('ciclos_fechados')
    .upsert(linha, { onConflict: 'tenant_id,mes_ref' })

  if (error) {
    throw new Error(`[${error.code ?? 'sem código'}] ${error.message}`)
  }

  return {
    tenant_id: tenantId,
    tenant_nome: linha.tenant_nome,
    mes_ref: mesRef,
    conversas: linha.conversas,
    tokens,
    custo_brl: custoBrl,
    custo_fixo_rateado: custoFixoRateado,
    valor_plano: valorPlano,
    instancias_extras: instanciasExtras,
    receita_inst_extras: receitaInstExtras,
    valor_cobrado: valorPlano,
    margem,
  }
}

/**
 * Custo fixo do mês dividido pelo número de clientes usado no rateio.
 *
 * Lê `custos_operacionais` (migration 007). Se a competência não tiver
 * lançamento, herda da anterior mais recente — mesma regra da tela de custos,
 * senão um fechamento no dia 1º sairia com custo fixo zero.
 */
async function calcularCustoFixoRateado(
  supabase: SupabaseClient,
  mesRef: string
): Promise<number> {
  const competencia = `${mesRef}-01`

  async function carregar(comp: string) {
    const { data } = await supabase
      .from('custos_operacionais')
      .select('chave, valor')
      .eq('competencia', comp)
    return data ?? []
  }

  let linhas = await carregar(competencia)

  if (linhas.length === 0) {
    const { data: anterior } = await supabase
      .from('custos_operacionais')
      .select('competencia')
      .lt('competencia', competencia)
      .order('competencia', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anterior) linhas = await carregar(anterior.competencia)
  }

  if (linhas.length === 0) return 0

  let total = 0
  let numClientes = 1
  for (const l of linhas) {
    if (l.chave === 'num_clientes') numClientes = Math.max(1, Number(l.valor))
    else total += Number(l.valor)
  }
  return total / numClientes
}
