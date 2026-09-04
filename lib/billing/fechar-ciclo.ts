import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PLANOS_MAP, planoInstanciasInclusas } from '@/lib/planos'
import { motivoSemReceitaDoCiclo, type MotivoSemReceita } from '@/lib/ciclo-vida'

// A regra de reconhecimento de receita mora em `lib/ciclo-vida`, junto do
// resto do ciclo de vida do cliente e livre de qualquer dependência de
// servidor: as telas admin precisam dela no browser, e importar este módulo
// de billing lá arrastaria o fechamento inteiro para o bundle do cliente.
export { motivoSemReceitaDoCiclo, type MotivoSemReceita, type EstadoFaturamento } from '@/lib/ciclo-vida'

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
  /** Atendimentos do ciclo que saíram de crédito extra, não da franquia. */
  atendimentos_credito: number
  /** Competência: receita dos créditos consumidos no mês. Entra na margem. */
  receita_creditos: number
  /** Caixa: valor dos lotes ativados no mês. Não entra na margem. */
  creditos_vendidos_valor: number
  valor_cobrado: number
  /** Por que a mensalidade nao virou receita, ou null quando o ciclo foi faturado. */
  motivo_sem_receita: MotivoSemReceita | null
  margem: number
}

/**
 * Receita de créditos extras do mês, nas duas visões.
 *
 * Competência (`consumida`) sai do ledger: cada linha com origem 'credito'
 * vale o `valor_unitario` do lote de onde foi debitada — e não o preço de
 * tabela, porque um lote personalizado ou uma condição comercial diferente
 * mudam esse valor, e o fechamento tem que refletir o que foi de fato cobrado.
 *
 * Caixa (`vendida`) sai dos lotes ativados no período.
 */
async function receitaCreditos(
  supabase: SupabaseClient,
  tenantId: string,
  mesRef: string,
  inicio: string,
  fim: string
): Promise<{ consumida: number; atendimentos: number; vendidaValor: number; vendidaQtd: number }> {
  const { data: consumos } = await supabase
    .from('atendimento_consumo')
    .select('pacote_id')
    .eq('tenant_id', tenantId)
    .eq('ciclo_ref', mesRef)
    .eq('origem', 'credito')

  const atendimentos = consumos?.length ?? 0
  let consumida = 0

  if (atendimentos > 0) {
    const ids = Array.from(new Set(
      (consumos ?? []).map(c => (c as { pacote_id: string | null }).pacote_id).filter(Boolean)
    )) as string[]

    const { data: lotes } = await supabase
      .from('credito_pacotes')
      .select('id, valor_unitario')
      .in('id', ids)

    const preco: Record<string, number> = {}
    for (const l of lotes ?? []) preco[l.id] = Number(l.valor_unitario ?? 0)

    for (const c of consumos ?? []) {
      const id = (c as { pacote_id: string | null }).pacote_id
      consumida += id ? (preco[id] ?? 0) : 0
    }
  }

  const { data: vendidos } = await supabase
    .from('credito_pacotes')
    .select('quantidade_total, valor_pago')
    .eq('tenant_id', tenantId)
    .gte('ativado_em', inicio)
    .lt('ativado_em', fim)

  const vendidaValor = (vendidos ?? []).reduce((s, p) => s + Number(p.valor_pago ?? 0), 0)
  const vendidaQtd   = (vendidos ?? []).reduce((s, p) => s + (p.quantidade_total ?? 0), 0)

  return { consumida: Number(consumida.toFixed(2)), atendimentos, vendidaValor, vendidaQtd }
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
    .select('nome, plano, conta_demo, faturamento_cortesia_ate, status_comercial, expira_em')
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

  // Instâncias inclusas variam por plano desde agosto/2026: Dominância traz 3
  // e Elite traz 5, enquanto os demais seguem com 1. Antes o cálculo era fixo
  // em "da 2ª em diante", o que cobraria R$ 67 por instância que o plano já
  // inclui — Dominância pagaria 2 extras indevidas e Elite pagaria 4.
  const inclusas = planoInstanciasInclusas(planoKey)
  const instanciasExtras = Math.max(0, (totalInstancias ?? 0) - inclusas)
  const receitaInstExtras = instanciasExtras * CUSTO_INSTANCIA_EXTRA

  // Custo fixo rateado, congelado no fechamento. O rateio muda quando entra ou
  // sai cliente; recalcular depois daria um número diferente do que valia aqui.
  const custoFixoRateado = await calcularCustoFixoRateado(supabase, mesRef, fim)

  const creditos = await receitaCreditos(supabase, tenantId, mesRef, inicio, fim)

  // Reconhecimento de receita. Quando o ciclo não é faturado, as receitas zeram
  // e ele passa a mostrar a margem NEGATIVA que realmente teve — conversas,
  // tokens e custo continuam gravados, porque a operação existiu e custou.
  //
  // Crédito extra é comprado à parte, então em cortesia ou em mês sem acesso ele
  // CONTINUA sendo receita: o cliente pagou por aquilo. Só a conta demo zera
  // tudo, porque ali nem a compra é real.
  const motivoSemReceita = motivoSemReceitaDoCiclo(tenant ?? {}, mesRef)
  const semReceita = motivoSemReceita !== null

  const receitaPlano   = semReceita ? 0 : valorPlano
  const receitaInst    = semReceita ? 0 : receitaInstExtras
  const receitaCredito = motivoSemReceita === 'conta_demo' ? 0 : creditos.consumida

  // A receita de crédito entra pela COMPETÊNCIA (consumo), não pela venda: o
  // custo de IA de um atendimento pago com crédito cai no mês em que ele
  // acontece, e usar o valor da venda faria o mês da compra parecer ótimo e o
  // mês do uso parecer prejuízo, sem nada ter mudado na operação.
  const margem = receitaPlano + receitaInst + receitaCredito
    - custoBrl - custoFixoRateado

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
    receita_inst_extras:  receitaInst,
    atendimentos_credito:    creditos.atendimentos,
    receita_creditos:        receitaCredito,
    creditos_vendidos_qtd:   creditos.vendidaQtd,
    creditos_vendidos_valor: creditos.vendidaValor,
    valor_cobrado:        receitaPlano,
    motivo_sem_receita:   motivoSemReceita,
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
    receita_inst_extras: receitaInst,
    atendimentos_credito: creditos.atendimentos,
    receita_creditos: receitaCredito,
    creditos_vendidos_valor: creditos.vendidaValor,
    valor_cobrado: receitaPlano,
    motivo_sem_receita: motivoSemReceita,
    margem,
  }
}

/**
 * Custo fixo do mês dividido pelos clientes que existiam naquele mês.
 *
 * Lê `custos_operacionais` (migration 007). Se a competência não tiver
 * lançamento, herda da anterior mais recente — mesma regra da tela de custos,
 * senão um fechamento no dia 1º sairia com custo fixo zero.
 *
 * O DIVISOR É CONTADO NO BANCO, não lido de `num_clientes`.
 *
 * `num_clientes` era um número digitado à mão na tela de custos e ficou em 1
 * enquanto a base crescia. Com isso cada ciclo recebia o custo fixo INTEIRO em
 * vez da sua fatia: com 2 clientes, a operação inteira era cobrada duas vezes
 * por mês. Em jul+ago/2026 isso lançou R$ 1.172,84 de custo fixo onde a
 * operação custou R$ 586,42, e a margem do período apareceu como −R$ 1.189,18
 * em vez de −R$ 602,76.
 *
 * A regra que torna o rateio coerente é simples: a soma das fatias tem que dar
 * o total. Por isso conta TODO cliente vivo no mês, inclusive conta demo e
 * cliente em cortesia — eles consomem a mesma infraestrutura, e deixá-los de
 * fora empurraria o custo deles para quem paga. É também o que torna visível
 * quanto custa manter uma conta que não fatura.
 *
 * Arquivado não entra: saiu da operação. Cliente criado depois do mês também
 * não — ele não existia para ratear nada.
 */
async function calcularCustoFixoRateado(
  supabase: SupabaseClient,
  mesRef: string,
  fimDoMes: string
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

  // `num_clientes` continua sendo ignorado de propósito ao somar: ele é um
  // parâmetro de rateio, não uma despesa. Somá-lo inflaria o custo fixo.
  const total = linhas
    .filter(l => l.chave !== 'num_clientes')
    .reduce((s, l) => s + Number(l.valor), 0)

  const { count } = await supabase
    .from('tenants')
    .select('id', { count: 'exact', head: true })
    .neq('status_comercial', 'arquivado')
    .lte('criado_em', fimDoMes)

  // Nunca divide por zero, e nunca infla a fatia por uma contagem que falhou:
  // no pior caso o ciclo carrega o custo inteiro, que é o comportamento antigo
  // e conservador — erra para o lado de mostrar margem menor, não maior.
  const numClientes = Math.max(1, count ?? 1)

  return total / numClientes
}
