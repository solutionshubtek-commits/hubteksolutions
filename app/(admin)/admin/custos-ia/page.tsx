'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  ChevronDown,
  RefreshCw,
  Bot,
  Brain,
  MessageSquare,
  Download,
  FileText,
  Settings,
  X,
  Users,
} from 'lucide-react'
import { exportPDF } from '@/lib/exportPDF'
import { PLANOS_MAP as PLANOS } from '@/lib/planos'
import { motivoSemReceitaDoCiclo, type MotivoSemReceita } from '@/lib/billing/fechar-ciclo'

// ─── Planos ───────────────────────────────────────────────────────────────────


const CUSTO_INSTANCIA_EXTRA = 67.00

// Fallback usado só enquanto a API não responde, ou quando a competência ainda
// não tem nada gravado e não há mês anterior para herdar. A fonte de verdade é
// a tabela `custos_operacionais` (migration 007) — antes destes valores viverem
// no banco, o modal não persistia nada e todo F5 restaurava esta constante.
const CUSTOS_FIXOS_DEFAULT: CustosFixos = {
  vercel: 98.27,
  supabase: 122.83,
  vps: 33.00,
  dominio: 12.81,
  claudePro: 120.00,
  github: 19.65,
  resend: 98.27,
  creditosOpenai: 0,
  creditosAnthropic: 0,
}

// Rótulos e agrupamento do modal. `grupo: 'creditos'` separa visualmente o que é
// recarga de engine do que é infraestrutura — são naturezas diferentes: os
// créditos variam a cada mês conforme o consumo, a infra é recorrente e estável.
const CAMPOS_CUSTO: Array<{ chave: keyof CustosFixos; label: string; grupo: 'infra' | 'creditos' }> = [
  { chave: 'vercel',            label: 'Vercel',            grupo: 'infra'    },
  { chave: 'supabase',          label: 'Supabase',          grupo: 'infra'    },
  { chave: 'vps',               label: 'VPS',               grupo: 'infra'    },
  { chave: 'dominio',           label: 'Domínio',           grupo: 'infra'    },
  { chave: 'claudePro',         label: 'Claude Pro',        grupo: 'infra'    },
  { chave: 'github',            label: 'GitHub',            grupo: 'infra'    },
  { chave: 'resend',            label: 'Resend',            grupo: 'infra'    },
  { chave: 'creditosOpenai',    label: 'Créditos OpenAI',   grupo: 'creditos' },
  { chave: 'creditosAnthropic', label: 'Créditos Anthropic', grupo: 'creditos' },
]

// camelCase da UI ↔ snake_case da coluna `chave` em custos_operacionais.
const CHAVE_API: Record<keyof CustosFixos, string> = {
  vercel:            'vercel',
  supabase:          'supabase',
  vps:               'vps',
  dominio:           'dominio',
  claudePro:         'claude_pro',
  github:            'github',
  resend:            'resend',
  creditosOpenai:    'creditos_openai',
  creditosAnthropic: 'creditos_anthropic',
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AiUsageRow {
  tenant_id: string
  ciclo_mes: number
  ciclo_ano: number
  tokens_entrada: number
  tokens_saida: number
  custo_estimado_reais: number
  motor_utilizado: string
  tenants: { nome: string; plano?: string } | { nome: string; plano?: string }[] | null
}

interface TenantOption {
  id: string
  nome: string
  plano?: string
  // Estado de faturamento — a mensalidade deste cliente conta como receita?
  // Sem isto a tela somava o plano de TODO cliente cadastrado, inclusive a
  // conta demo da própria Hubtek, e exibia margem positiva para um período em
  // que ninguém pagou.
  conta_demo?: boolean | null
  faturamento_cortesia_ate?: string | null
  status_comercial?: string | null
  expira_em?: string | null
  criado_em?: string | null
}

const MOTIVO_SEM_RECEITA: Record<MotivoSemReceita, { label: string; cor: string }> = {
  conta_demo: { label: 'Conta demo', cor: '#818CF8' },
  cortesia:   { label: 'Cortesia',   cor: '#F59E0B' },
  sem_acesso: { label: 'Sem acesso', cor: '#71717A' },
}

interface MesData {
  label: string
  openai: number
  anthropic: number
  total: number
  conversas: number
}

interface ClienteRow {
  tenantId: string
  nome: string
  plano: string
  openai_tokens: number
  anthropic_tokens: number
  openai_custo: number
  anthropic_custo: number
  total_custo: number
  total_tokens: number
  conversas_ano: number
}

interface CustosFixos {
  vercel: number
  supabase: number
  vps: number
  dominio: number
  claudePro: number
  github: number
  resend: number
  // Recarga de créditos nas engines: dinheiro que efetivamente sai para
  // OpenAI/Anthropic no mês. É custo fixo operacional.
  //
  // NÃO confundir com `custo_estimado_reais` da ai_usage, que aparece nos
  // relatórios como "Custo API": aquilo é uma estimativa POR CLIENTE derivada
  // de tokens, usada para entender consumo e precificar o produto. Os dois
  // números falam do mesmo fornecedor, mas respondem perguntas diferentes e não
  // devem ser somados um ao outro.
  creditosOpenai: number
  creditosAnthropic: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MESES_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function mesLabel(mes: number, ano: number) {
  return `${MESES_LABEL[mes - 1]}/${String(ano).slice(2)}`
}

function fmtBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function fmtTokens(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`
  return String(val)
}

function getTenantNome(t: AiUsageRow['tenants']): string {
  if (!t) return '—'
  if (Array.isArray(t)) return t[0]?.nome ?? '—'
  return t.nome
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CustosIAPage() {
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>('todos')
  const [selectedAno, setSelectedAno] = useState<number>(new Date().getFullYear())
  // 'todos' = ano inteiro consolidado; 1..12 = mês específico. Filtra KPIs,
  // tabela por cliente e balizador. Os gráficos continuam mostrando os 12 meses
  // (é o que eles existem para mostrar) e apenas destacam o mês selecionado.
  const [selectedMes, setSelectedMes] = useState<number | 'todos'>('todos')
  const [rawData, setRawData] = useState<AiUsageRow[]>([])
  // Conversas cruas do ano: { tenant_id, mes }. Guardadas sem agregar porque o
  // filtro de período precisa recortar por mês E por cliente ao mesmo tempo —
  // um mapa pré-agregado só por mês (como era antes) não permite as duas coisas.
  const [conversasRaw, setConversasRaw] = useState<Array<{ tenantId: string; mes: number }>>([])
  // Anos que realmente têm dados. Vem de consulta própria, SEM filtro de ano:
  // derivar de `rawData` era um beco sem saída, porque a query já filtra por
  // `ciclo_ano = selectedAno` — o dropdown só listava o ano corrente e não
  // havia como trocar de ano pela interface.
  const [anosComDados, setAnosComDados] = useState<number[]>([])
  const [instanciasPorTenant, setInstanciasPorTenant] = useState<Record<string, number>>({})
  const [showCustosModal, setShowCustosModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [custosFixos, setCustosFixos] = useState<CustosFixos>(CUSTOS_FIXOS_DEFAULT)

  const [salvandoCustos, setSalvandoCustos] = useState(false)
  const [erroCustos, setErroCustos] = useState('')
  // Competência de onde os valores vieram, quando o mês selecionado ainda não
  // tem lançamento próprio. Fica visível no modal para os créditos herdados não
  // passarem por valor confirmado do mês.
  const [custosHerdadosDe, setCustosHerdadosDe] = useState<string | null>(null)

  const anoAtual = new Date().getFullYear()
  const anosDisponiveis = anosComDados.length > 0
    ? Array.from(new Set([...anosComDados, anoAtual])).sort((a, b) => b - a)
    : [anoAtual]

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)
    try {
      const { data: tData } = await supabase.from('tenants')
        .select('id, nome, plano, conta_demo, faturamento_cortesia_ate, status_comercial, expira_em, criado_em')
        .order('nome')
      setTenants((tData ?? []) as TenantOption[])

      // Busca instâncias por tenant
      const { data: instData } = await supabase
        .from('tenant_instances')
        .select('tenant_id')
      const instMap: Record<string, number> = {}
      ;(instData ?? []).forEach((row: { tenant_id: string }) => {
        instMap[row.tenant_id] = (instMap[row.tenant_id] ?? 0) + 1
      })
      setInstanciasPorTenant(instMap)

      let usageQuery = supabase
        .from('ai_usage')
        .select('tenant_id, ciclo_mes, ciclo_ano, tokens_entrada, tokens_saida, custo_estimado_reais, motor_utilizado, tenants(nome, plano)')
        .eq('ciclo_ano', selectedAno)
      if (selectedTenant !== 'todos') usageQuery = usageQuery.eq('tenant_id', selectedTenant)
      const { data: usage } = await usageQuery
      setRawData((usage ?? []) as unknown as AiUsageRow[])

      let convQuery = supabase
        .from('conversations')
        .select('tenant_id, criado_em')
        .gte('criado_em', `${selectedAno}-01-01`)
        .lt('criado_em', `${selectedAno + 1}-01-01`)
      if (selectedTenant !== 'todos') convQuery = convQuery.eq('tenant_id', selectedTenant)
      const { data: convData } = await convQuery

      setConversasRaw(
        (convData ?? []).map((c: { criado_em: string; tenant_id: string }) => ({
          tenantId: c.tenant_id,
          // getUTCMonth, não getMonth. `ai_usage.ciclo_mes` é gravado no
          // servidor a partir de `new Date().getMonth()+1`, que na Vercel roda
          // em UTC. Usar o mês LOCAL do navegador (BRT = UTC-3) jogava as
          // conversas criadas entre 21h e meia-noite para o mês anterior,
          // enquanto os tokens da mesma conversa ficavam no mês seguinte — os
          // gráficos "Custo mensal" e "Conversas por mês" desalinhavam na virada.
          mes: new Date(c.criado_em).getUTCMonth() + 1,
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [selectedTenant, selectedAno])

  // Anos com dados — consulta própria, sem filtro de ano. Precisa ser separada
  // de fetchData justamente porque aquela query filtra por `selectedAno`.
  const fetchAnos = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('ai_usage').select('ciclo_ano')
    const anos = Array.from(new Set((data ?? []).map((r: { ciclo_ano: number }) => r.ciclo_ano)))
    setAnosComDados(anos)
  }, [])

  useEffect(() => { fetchAnos() }, [fetchAnos])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Custos fixos: carregar / salvar ──
  //
  // Escopo por competência = mês selecionado no seletor de fechamento
  // (balizMes/selectedAno), o mesmo período que alimenta os cards de baliza e
  // o TXT de fechamento. Trocar o mês recarrega os custos daquele mês.
  //
  // O balizador é sempre MENSAL — é referência de fechamento, e fechamento não
  // existe para "ano inteiro". Quando o seletor de período está num mês, segue
  // esse mês; na visão consolidada, cai no mês corrente. Não tem seletor
  // próprio: o período é escolhido num lugar só, no topo da página.
  const balizMes = selectedMes === 'todos' ? new Date().getMonth() + 1 : selectedMes
  const competencia = `${selectedAno}-${String(balizMes).padStart(2, '0')}`
  // Último instante do mês baliza: quem foi criado depois disso não existia
  // para ratear custo nem para gerar receita naquele mês.
  const fimDoMesBaliz = new Date(Date.UTC(selectedAno, balizMes, 0, 23, 59, 59))

  const carregarCustos = useCallback(async () => {
    setErroCustos('')
    try {
      const res = await fetch(`/api/admin/custos-operacionais?competencia=${competencia}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { valores: Record<string, number>; herdadoDe: string | null } = await res.json()

      setCustosHerdadosDe(data.herdadoDe)
      setCustosFixos(prev => {
        const proximo = { ...prev }
        for (const [campo, chaveApi] of Object.entries(CHAVE_API) as Array<[keyof CustosFixos, string]>) {
          // Só sobrescreve o que veio do banco: uma chave ausente mantém o
          // default em vez de virar 0 e sumir do rateio silenciosamente.
          if (chaveApi in data.valores) proximo[campo] = data.valores[chaveApi]
        }
        return proximo
      })
    } catch (err) {
      console.error('[custos-ia] falha ao carregar custos fixos:', err)
      setErroCustos('Não foi possível carregar os custos salvos. Os valores exibidos são os padrões.')
    }
  }, [competencia])

  useEffect(() => { carregarCustos() }, [carregarCustos])

  async function salvarCustos() {
    setSalvandoCustos(true)
    setErroCustos('')
    try {
      // Gravado como registro histórico do que valeu naquela competência. O
      // fechamento não lê mais este campo — ele conta os clientes por conta
      // própria — mas manter o valor certo evita que um relatório antigo
      // contradiga o número que a tela mostra.
      const valores: Record<string, number> = { num_clientes: clientesNoRateio }
      for (const [campo, chaveApi] of Object.entries(CHAVE_API) as Array<[keyof CustosFixos, string]>) {
        valores[chaveApi] = custosFixos[campo]
      }

      const res = await fetch('/api/admin/custos-operacionais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia, valores }),
      })
      if (!res.ok) {
        const corpo: { error?: string; detalhe?: string | null } = await res.json().catch(() => ({}))
        const base = corpo.error ?? `HTTP ${res.status}`
        throw new Error(corpo.detalhe ? `${base} — ${corpo.detalhe}` : base)
      }

      // Gravou nesta competência: os valores deixam de ser herdados.
      setCustosHerdadosDe(null)
      setShowCustosModal(false)
    } catch (err) {
      // O modal fica ABERTO no erro. Fechar aqui repetiria o bug original, em
      // que o usuário via o modal fechar e presumia que tinha salvado.
      console.error('[custos-ia] falha ao salvar custos fixos:', err)
      setErroCustos(err instanceof Error ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setSalvandoCustos(false)
    }
  }

  // ── Derivados ──

  // Recorte do período: 'todos' = ano inteiro, número = aquele mês.
  const noPeriodo = useCallback(
    (mes: number) => selectedMes === 'todos' || mes === selectedMes,
    [selectedMes]
  )

  const dadosPeriodo     = rawData.filter(r => noPeriodo(r.ciclo_mes))
  const conversasPeriodo = conversasRaw.filter(c => noPeriodo(c.mes))

  // Rótulo do período, usado nos títulos e nos KPIs para o número exibido nunca
  // ficar ambíguo entre "ano inteiro" e "mês selecionado".
  const periodoLabel = selectedMes === 'todos'
    ? String(selectedAno)
    : `${MESES_FULL[selectedMes - 1]}/${selectedAno}`

  // Mapa mês → total de conversas (do ano inteiro; os gráficos precisam dos 12).
  const conversasPorMes = conversasRaw.reduce<Record<string, number>>((acc, c) => {
    acc[String(c.mes)] = (acc[String(c.mes)] ?? 0) + 1
    return acc
  }, {})

  const totalCusto = dadosPeriodo.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalTokens = dadosPeriodo.reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0)
  const totalOpenAI = dadosPeriodo.filter(r => r.motor_utilizado === 'openai').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalAnthropic = dadosPeriodo.filter(r => r.motor_utilizado === 'anthropic').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalConversasPeriodo = conversasPeriodo.length
  const totalFixoMensal = Object.values(custosFixos).reduce((s, v) => s + v, 0)

  // Divisor CONTADO, não digitado. `num_clientes` era um campo manual que ficou
  // em 1 enquanto a base crescia, e cada ciclo passou a receber o custo fixo
  // inteiro em vez da sua fatia — a operação inteira cobrada uma vez por
  // cliente. É a mesma contagem que `calcularCustoFixoRateado` faz no
  // fechamento, para a tela e o banco não divergirem.
  //
  // Conta demo e cliente em cortesia entram no divisor: consomem a mesma
  // infraestrutura, e tirá-los empurraria o custo deles para quem paga.
  const clientesNoRateio = tenants.filter(t =>
    t.status_comercial !== 'arquivado' &&
    (!t.criado_em || new Date(t.criado_em) <= fimDoMesBaliz)
  ).length

  const fixoPorCliente = totalFixoMensal / Math.max(1, clientesNoRateio)

  // Instâncias extras do tenant selecionado (ou soma de todos)
  const instanciasExtras = (() => {
    if (selectedTenant !== 'todos') {
      const total = instanciasPorTenant[selectedTenant] ?? 0
      return Math.max(0, total - 1)
    }
    return Object.values(instanciasPorTenant).reduce((s, v) => s + Math.max(0, v - 1), 0)
  })()
  const custoInstanciasExtras = instanciasExtras * CUSTO_INSTANCIA_EXTRA

  const seriesMensal: MesData[] = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1
    const rows = rawData.filter(r => r.ciclo_mes === mes)
    const openai = rows.filter(r => r.motor_utilizado === 'openai').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
    const anthropic = rows.filter(r => r.motor_utilizado === 'anthropic').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
    return { label: mesLabel(mes, selectedAno), openai, anthropic, total: openai + anthropic, conversas: conversasPorMes[String(mes)] ?? 0 }
  })

  const maxBarCusto = Math.max(...seriesMensal.map(m => m.total), 0.01)
  const maxBarConv  = Math.max(...seriesMensal.map(m => m.conversas), 1)

  const clienteMap: Record<string, ClienteRow> = {}
  if (selectedTenant === 'todos') {
    // Semeia com TODOS os tenants, não só com quem tem linha em ai_usage.
    // Antes a tabela era construída apenas a partir de rawData, então um cliente
    // com conversas mas sem consumo registrado sumia da listagem — e como o
    // registro de consumo é reconhecidamente incompleto (logAiUsage só roda no
    // fim do fluxo), isso escondia clientes reais. Agora ele aparece com custo
    // zero, que é uma informação, em vez de não aparecer, que é um buraco.
    tenants.forEach(t => {
      clienteMap[t.id] = {
        tenantId: t.id, nome: t.nome, plano: t.plano ?? 'essencial',
        openai_tokens: 0, anthropic_tokens: 0, openai_custo: 0, anthropic_custo: 0,
        total_custo: 0, total_tokens: 0, conversas_ano: 0,
      }
    })

    // Conversas do período, por cliente.
    conversasPeriodo.forEach(c => {
      if (clienteMap[c.tenantId]) clienteMap[c.tenantId].conversas_ano += 1
    })

    dadosPeriodo.forEach(r => {
      // Fallback para tenant que exista em ai_usage mas não na lista de tenants
      // (cliente removido, por exemplo) — melhor mostrar que ocultar.
      if (!clienteMap[r.tenant_id]) {
        const planoRaw = Array.isArray(r.tenants) ? r.tenants[0]?.plano : (r.tenants as { plano?: string } | null)?.plano
        clienteMap[r.tenant_id] = {
          tenantId: r.tenant_id, nome: getTenantNome(r.tenants), plano: planoRaw ?? 'essencial',
          openai_tokens: 0, anthropic_tokens: 0, openai_custo: 0, anthropic_custo: 0,
          total_custo: 0, total_tokens: 0, conversas_ano: 0,
        }
      }
      const t = clienteMap[r.tenant_id]
      const tok = r.tokens_entrada + r.tokens_saida
      const custo = Number(r.custo_estimado_reais)
      t.total_tokens += tok; t.total_custo += custo
      if (r.motor_utilizado === 'openai') { t.openai_tokens += tok; t.openai_custo += custo }
      else { t.anthropic_tokens += tok; t.anthropic_custo += custo }
    })
  }
  // Ordena por custo e, no empate (vários clientes zerados), por conversas —
  // senão a lista embaralha a cada render sem critério visível.
  const clientes = Object.values(clienteMap).sort(
    (a, b) => b.total_custo - a.total_custo || b.conversas_ano - a.conversas_ano
  )
  const totalConversasClientes = clientes.reduce((s, c) => s + c.conversas_ano, 0)

  const mesAtual = new Date().getMonth() + 1
  const varPct = (() => {
    const cur = seriesMensal[mesAtual - 1]?.total ?? 0
    const prev = mesAtual > 1 ? (seriesMensal[mesAtual - 2]?.total ?? 0) : 0
    return prev > 0 ? ((cur - prev) / prev) * 100 : null
  })()

  // ── Balizador do mês selecionado ──
  //
  const balizTenant = tenants.find(t => t.id === selectedTenant)
  const balizPlanoKey = balizTenant?.plano ?? 'essencial'
  const balizPlano = PLANOS[balizPlanoKey] ?? PLANOS.essencial
  const balizRows = rawData.filter(r => r.ciclo_mes === balizMes)
  const balizConversas = conversasPorMes[String(balizMes)] ?? 0
  const balizCustoAPI = balizRows.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const balizInstanciasExtras = selectedTenant !== 'todos'
    ? Math.max(0, (instanciasPorTenant[selectedTenant] ?? 0) - 1)
    : Object.values(instanciasPorTenant).reduce((s, v) => s + Math.max(0, v - 1), 0)
  const balizCustoInstExtras = balizInstanciasExtras * CUSTO_INSTANCIA_EXTRA

  // ESCOPO. Em "Todos os clientes", `balizCustoAPI` é o consumo somado de TODOS
  // e `balizConversas` são as conversas de todos — mas o custo fixo continuava
  // sendo `fixoPorCliente`, a fatia de UM cliente. Somar os dois misturava
  // escopos e produzia um "custo operacional" e um "custo por conversa" que não
  // correspondiam a nada: nem ao consolidado, nem a um cliente.
  //
  // Agora o custo fixo e a receita acompanham o escopo selecionado.
  const ehConsolidado = selectedTenant === 'todos'
  const balizCustoFixo = ehConsolidado ? totalFixoMensal : fixoPorCliente
  // No consolidado a receita é a soma dos planos de todos os clientes; antes
  // usava o plano 'essencial' como padrão para o conjunto inteiro, o que fazia
  // a margem consolidada comparar o custo de N clientes com a mensalidade de um.
  // Reconhecimento de receita — a MESMA regra do fechamento e da tela de
  // relatórios. Antes, esta tela somava a mensalidade de todo cliente
  // cadastrado e mostrava margem positiva para meses em que ninguém pagou:
  // conta demo, bônus de implantação e cliente sem acesso entravam como
  // receita. Duas telas do mesmo admin davam respostas opostas sobre o mesmo
  // mês.
  const semReceitaDe = (t: TenantOption) => motivoSemReceitaDoCiclo(t, competencia)

  const balizReceitaPlano = ehConsolidado
    ? tenants.reduce(
        (s, t) => s + (semReceitaDe(t) ? 0 : (PLANOS[t.plano ?? 'essencial']?.valor ?? 0)), 0
      )
    : (balizTenant && semReceitaDe(balizTenant) ? 0 : balizPlano.valor)

  const balizMotivo = balizTenant ? semReceitaDe(balizTenant) : null
  const tenantsSemReceita = tenants.filter(t => semReceitaDe(t))
  const totalNaoFaturado = tenantsSemReceita.reduce(
    (s, t) => s + (PLANOS[t.plano ?? 'essencial']?.valor ?? 0), 0
  )

  // Custo operacional = API + fixo (instâncias extras são receita, não custo)
  const balizCustoTotal = balizCustoAPI + balizCustoFixo
  const balizMargem = balizReceitaPlano + balizCustoInstExtras - balizCustoFixo - balizCustoAPI
  const balizMargemPct = balizReceitaPlano > 0 ? (balizMargem / balizReceitaPlano) * 100 : 0
  const balizCustoPorConv = balizConversas > 0 ? balizCustoAPI / balizConversas : 0

  // ── Export TXT ──
  function exportarFechamento() {
    const tenant = tenants.find(t => t.id === selectedTenant)
    const nomeCliente = tenant?.nome ?? 'Consolidado'
    const planoKey = tenant?.plano ?? 'essencial'
    const plano = PLANOS[planoKey] ?? PLANOS.essencial
    const mesRows = rawData.filter(r => r.ciclo_mes === balizMes)
    const conversas = conversasPorMes[String(balizMes)] ?? 0
    const tokens = mesRows.reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0)
    const custoAPI = mesRows.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
    const instExtras = selectedTenant !== 'todos'
      ? Math.max(0, (instanciasPorTenant[selectedTenant] ?? 0) - 1)
      : Object.values(instanciasPorTenant).reduce((s, v) => s + Math.max(0, v - 1), 0)
    // Instância extra é RECEITA (o cliente paga R$ 67 por instância adicional),
    // não custo. O card "Margem estimada" da tela sempre tratou assim, mas o TXT
    // e o PDF somavam ao custo e subtraíam da margem — o mesmo fechamento dava
    // números diferentes na tela e no arquivo entregue ao cliente. Alinhado com
    // a tela, que é a definição correta.
    const receitaInstExtras = instExtras * CUSTO_INSTANCIA_EXTRA
    const custoTotal = custoAPI + fixoPorCliente
    // Mesma regra da tela: mês de conta demo, cortesia ou sem acesso não vira
    // receita. O arquivo entregue não pode discordar do card na tela.
    const motivoExport = tenant ? semReceitaDe(tenant) : null
    const receitaPlanoExport = motivoExport ? 0 : plano.valor
    const margem = receitaPlanoExport + receitaInstExtras - custoTotal
    const custoPorConv = conversas > 0 ? custoAPI / conversas : 0
    const mesNome = `${MESES_FULL[balizMes - 1]} ${selectedAno}`
    const pad = (s: string, n: number) => s.padEnd(n, ' ')

    const linhas = [
      `FECHAMENTO MENSAL — HUBTEK SOLUTIONS`,
      `Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      ``,
      `Cliente: ${nomeCliente} — ${mesNome}`,
      `Plano: ${plano.label} (${plano.limite} atendimentos/mês)`,
      `─────────────────────────────────────`,
      `${pad('Conversas iniciadas:', 25)} ${conversas}`,
      `${pad('Total de tokens:', 25)} ${tokens.toLocaleString('pt-BR')}`,
      `${pad('Custo estimado (API):', 25)} ${fmtBRL(custoAPI)}`,
      `${pad('Custo fixo rateado:', 25)} ${fmtBRL(fixoPorCliente)}`,
      `${pad('Custo total operacional:', 25)} ${fmtBRL(custoTotal)}`,
      `─────────────────────────────────────`,
      `${pad('Valor do plano:', 25)} ${fmtBRL(receitaPlanoExport)}${motivoExport ? ` (nao faturado — ${MOTIVO_SEM_RECEITA[motivoExport].label.toLowerCase()}; contratado ${fmtBRL(plano.valor)})` : ''}`,
      ...(instExtras > 0 ? [`${pad('Instâncias extras:', 25)} ${instExtras}x ${fmtBRL(CUSTO_INSTANCIA_EXTRA)} = ${fmtBRL(receitaInstExtras)} (receita)`] : []),
      `${pad('Margem estimada:', 25)} ${fmtBRL(margem)}`,
      `${pad('Custo médio/conversa:', 25)} ${fmtBRL(custoPorConv)}`,
      `─────────────────────────────────────`,
      ``,
      `DETALHAMENTO POR MOTOR`,
      `OpenAI:    ${fmtTokens(mesRows.filter(r => r.motor_utilizado === 'openai').reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0))} tokens — ${fmtBRL(mesRows.filter(r => r.motor_utilizado === 'openai').reduce((s, r) => s + Number(r.custo_estimado_reais), 0))}`,
      `Anthropic: ${fmtTokens(mesRows.filter(r => r.motor_utilizado === 'anthropic').reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0))} tokens — ${fmtBRL(mesRows.filter(r => r.motor_utilizado === 'anthropic').reduce((s, r) => s + Number(r.custo_estimado_reais), 0))}`,
      ``,
      `CUSTOS FIXOS OPERACIONAIS (referência mensal)`,
      `Vercel:     ${fmtBRL(custosFixos.vercel)}`,
      `Supabase:   ${fmtBRL(custosFixos.supabase)}`,
      `VPS:        ${fmtBRL(custosFixos.vps)}`,
      `Domínio:    ${fmtBRL(custosFixos.dominio)}`,
      `Claude Pro: ${fmtBRL(custosFixos.claudePro)}`,
      `GitHub:     ${fmtBRL(custosFixos.github)}`,
      `Resend:     ${fmtBRL(custosFixos.resend)}`,
      `Créditos OpenAI:    ${fmtBRL(custosFixos.creditosOpenai)}`,
      `Créditos Anthropic: ${fmtBRL(custosFixos.creditosAnthropic)}`,
      `Total fixo: ${fmtBRL(totalFixoMensal)} ÷ ${clientesNoRateio} cliente(s) = ${fmtBRL(fixoPorCliente)}/cliente`,
      ...(instExtras > 0 ? [`Instâncias extras (receita): ${instExtras}x R$ ${CUSTO_INSTANCIA_EXTRA.toFixed(2)} = ${fmtBRL(receitaInstExtras)}`] : []),
      ``,
      `─────────────────────────────────────`,
      `Hubtek Solutions — app.hubteksolutions.tech`,
    ]

    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fechamento_${nomeCliente.replace(/\s+/g, '_')}_${MESES_LABEL[balizMes - 1]}${selectedAno}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  // ── Export PDF ──
  function exportarFechamentoPDF() {
    const tenant = tenants.find(t => t.id === selectedTenant)
    const nomeCliente = tenant?.nome ?? 'Consolidado'
    const planoKey = tenant?.plano ?? 'essencial'
    const plano = PLANOS[planoKey] ?? PLANOS.essencial
    const mesRows = rawData.filter(r => r.ciclo_mes === balizMes)
    const conversas = conversasPorMes[String(balizMes)] ?? 0
    const custoAPI = mesRows.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
    const instExtras = selectedTenant !== 'todos'
      ? Math.max(0, (instanciasPorTenant[selectedTenant] ?? 0) - 1)
      : Object.values(instanciasPorTenant).reduce((s, v) => s + Math.max(0, v - 1), 0)
    // Mesma correção do TXT: instância extra é receita, não custo.
    const receitaInstExtras = instExtras * CUSTO_INSTANCIA_EXTRA
    const custoTotal = custoAPI + fixoPorCliente
    const motivoExport = tenant ? semReceitaDe(tenant) : null
    const receitaPlanoExport = motivoExport ? 0 : plano.valor
    const margem = receitaPlanoExport + receitaInstExtras - custoTotal
    const mesNome = `${MESES_FULL[balizMes - 1]} ${selectedAno}`

    const linhasPDF = [
      { descricao: 'Conversas iniciadas',     valor: conversas },
      { descricao: 'Custo estimado (API)',     valor: fmtBRL(custoAPI) },
      { descricao: 'Custo fixo rateado',       valor: fmtBRL(fixoPorCliente) },
      { descricao: 'Custo total operacional',  valor: fmtBRL(custoTotal) },
      {
        descricao: motivoExport
          ? `Valor do plano — nao faturado (${MOTIVO_SEM_RECEITA[motivoExport].label.toLowerCase()})`
          : 'Valor do plano',
        valor: fmtBRL(receitaPlanoExport),
      },
      ...(instExtras > 0 ? [{ descricao: `Instâncias extras — receita (${instExtras}x R$${CUSTO_INSTANCIA_EXTRA})`, valor: fmtBRL(receitaInstExtras) }] : []),
      { descricao: 'Margem estimada',          valor: fmtBRL(margem) },
    ]

    exportPDF({
      titulo: `Fechamento Mensal — ${mesNome}`,
      subtitulo: `Cliente: ${nomeCliente} · Plano: ${plano.label}`,
      colunas: [
        { label: 'Descrição', key: 'descricao', align: 'left'  },
        { label: 'Valor',     key: 'valor',     align: 'right' },
      ],
      linhas: linhasPDF,
      nomeArquivo: `fechamento_${nomeCliente.replace(/\s+/g, '_')}_${MESES_LABEL[balizMes - 1]}${selectedAno}`,
    })
    setShowExportModal(false)
  }

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Custos de IA</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Consumo de tokens, conversas e balizador de cobrança
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SelectField value={selectedAno} onChange={v => setSelectedAno(Number(v))}>
            {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
          </SelectField>
          <SelectField
            value={selectedMes}
            onChange={v => setSelectedMes(v === 'todos' ? 'todos' : Number(v))}
          >
            <option value="todos">Ano inteiro (consolidado)</option>
            {MESES_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </SelectField>
          <SelectField value={selectedTenant} onChange={v => setSelectedTenant(v)}>
            <option value="todos">Todos os clientes</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </SelectField>
          <button onClick={() => setShowCustosModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <Settings size={14} /> Custos fixos
          </button>
          <button onClick={fetchData} className="p-2 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <RefreshCw size={16} style={{ color: 'var(--text-secondary)' }} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={<DollarSign size={18} />} label={`Custo Total — ${periodoLabel}`} value={fmtBRL(totalCusto)} accent="#10B981" />
        <KpiCard icon={<MessageSquare size={18} />} label={`Conversas — ${periodoLabel}`} value={totalConversasPeriodo.toLocaleString('pt-BR')} accent="#6366F1"
          sub={totalConversasPeriodo > 0 ? `~${fmtBRL(totalCusto / totalConversasPeriodo)}/conversa` : undefined} />
        <KpiCard icon={<BarChart3 size={18} />} label="Tokens Consumidos" value={fmtTokens(totalTokens)} accent="#8B5CF6" />
        <KpiCard icon={<Bot size={18} />} label="Custo OpenAI" value={fmtBRL(totalOpenAI)} accent="#10A37F"
          sub={totalCusto > 0 ? `${((totalOpenAI / totalCusto) * 100).toFixed(0)}% do total` : undefined} />
        <KpiCard icon={<Brain size={18} />} label="Custo Anthropic" value={fmtBRL(totalAnthropic)} accent="#D97757"
          sub={totalCusto > 0 ? `${((totalAnthropic / totalCusto) * 100).toFixed(0)}% do total` : undefined} />
      </div>


      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Custo mensal — {selectedAno}</h2>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <LegendaDot cor="#10A37F" label="OpenAI" />
              <LegendaDot cor="#D97757" label="Anthropic" />
              {varPct !== null && (
                <span className="flex items-center gap-1 font-medium px-2 py-0.5 rounded-full"
                  style={{ background: varPct >= 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: varPct >= 0 ? '#EF4444' : '#10B981' }}>
                  {varPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {Math.abs(varPct).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <GraficoBarras series={seriesMensal} maxVal={maxBarCusto} mesAtual={mesAtual} selectedAno={selectedAno} loading={loading}
            renderTooltip={m => (<><div className="font-semibold mb-0.5">{m.label}</div><div className="text-green-400">OpenAI: {fmtBRL(m.openai)}</div><div className="text-orange-400">Anthropic: {fmtBRL(m.anthropic)}</div><div className="text-white font-semibold border-t border-gray-700 mt-1 pt-1">Total: {fmtBRL(m.total)}</div></>)}
            renderBarra={m => m.total > 0 ? (<div className="w-full h-full flex flex-col-reverse"><div style={{ height: `${(m.openai / m.total) * 100}%`, background: '#10A37F', minHeight: m.openai > 0 ? '2px' : '0' }} /><div style={{ height: `${(m.anthropic / m.total) * 100}%`, background: '#D97757', minHeight: m.anthropic > 0 ? '2px' : '0' }} /></div>) : null}
          />
        </div>

        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Conversas por mês — {selectedAno}</h2>
            <LegendaDot cor="#6366F1" label="Conversas abertas no mês" />
          </div>
          <GraficoBarras series={seriesMensal} maxVal={maxBarConv} mesAtual={mesAtual} selectedAno={selectedAno} loading={loading}
            getHeight={m => (m.conversas / maxBarConv) * 100}
            renderTooltip={m => (<><div className="font-semibold mb-0.5">{m.label}</div><div style={{ color: '#818CF8' }}>{m.conversas} conversa{m.conversas !== 1 ? 's' : ''} aberta{m.conversas !== 1 ? 's' : ''}</div>{m.conversas > 0 && m.total > 0 && <div className="text-gray-400 text-xs mt-1">{fmtBRL(m.total / m.conversas)} custo do mês / conversa aberta</div>}</>)}
            renderBarra={m => m.conversas > 0 ? (<div className="w-full h-full" style={{ background: 'linear-gradient(to top, #4F46E5, #818CF8)' }} />) : null}
          />
        </div>
      </div>

      {/* Balizador de cobrança */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Balizador de cobrança — {MESES_FULL[balizMes - 1]}/{selectedAno}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {selectedMes === 'todos'
                ? 'Fechamento é sempre mensal — mostrando o mês corrente. Escolha um mês no topo da página para fechar outro.'
                : 'Referência para fechamento mensal — segue o período selecionado no topo'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <button
                onClick={() => setShowExportModal(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
                style={{ background: '#10B981', color: '#fff' }}>
                <Download size={14} /> Exportar fechamento
              </button>
              {showExportModal && (
                <div className="absolute right-0 top-11 w-40 rounded-xl shadow-xl z-50 overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <button onClick={exportarFechamento}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <Download size={13} /> TXT
                  </button>
                  <button onClick={exportarFechamentoPDF}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <FileText size={13} /> PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <BalizCard label="Conversas" value={String(balizConversas)} sub={ehConsolidado ? 'todos os clientes' : `/ ${balizPlano.limite} limite`} cor="#6366F1" />
          <BalizCard label="Custo API" value={fmtBRL(balizCustoAPI)} sub="tokens consumidos" cor="#10A37F" />
          <BalizCard
            label={ehConsolidado ? 'Custo fixo total' : 'Custo fixo rateado'}
            value={fmtBRL(balizCustoFixo)}
            sub={ehConsolidado ? 'todos os clientes' : `1 de ${clientesNoRateio} cliente(s)`}
            cor="#8B5CF6"
          />
          <BalizCard
            label="Instâncias extras"
            value={balizInstanciasExtras > 0 ? fmtBRL(balizCustoInstExtras) : '—'}
            sub={balizInstanciasExtras > 0 ? `${balizInstanciasExtras}x R$${CUSTO_INSTANCIA_EXTRA} (receita)` : 'nenhuma'}
            cor={balizInstanciasExtras > 0 ? '#F59E0B' : 'var(--text-secondary)'}
          />
          <BalizCard label="Custo operacional" value={fmtBRL(balizCustoTotal)} sub="API + fixo" cor="#F59E0B" />
          <BalizCard
            label={ehConsolidado ? 'Receita dos planos' : 'Valor do plano'}
            value={fmtBRL(balizReceitaPlano)}
            sub={ehConsolidado
              ? `${tenants.length - tenantsSemReceita.length} de ${tenants.length} faturam`
              : (balizMotivo ? MOTIVO_SEM_RECEITA[balizMotivo].label : balizPlano.label)}
            cor={balizReceitaPlano > 0 ? "#10B981" : "var(--text-secondary)"}
          />
          <BalizCard label="Margem estimada" value={fmtBRL(balizMargem)} sub={`${balizMargemPct.toFixed(0)}% da receita`} cor={balizMargem >= 0 ? '#10B981' : '#EF4444'} />
        </div>

        {/* A tela precisa DIZER por que a receita é menor que a soma dos planos.
            Sem isto, o admin compara este card com a lista de clientes, vê os
            planos contratados lá e conclui que o número está errado. */}
        {tenantsSemReceita.length > 0 && (
          <div className="mt-3 pt-3 border-t text-xs leading-relaxed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {tenantsSemReceita.length} cliente(s) não geram receita em {periodoLabel}
            ({fmtBRL(totalNaoFaturado)} de mensalidade contratada):{' '}
            {tenantsSemReceita.map(t => `${t.nome} (${MOTIVO_SEM_RECEITA[semReceitaDe(t)!].label.toLowerCase()})`).join(', ')}.
            {' '}O custo de API e o rateio do custo fixo deles continuam contabilizados.
          </div>
        )}

        {balizConversas > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span>Custo de API por conversa:</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtBRL(balizCustoPorConv)}</span>
              <span className="ml-4">Custo operacional por conversa (API + fixo):</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtBRL(balizCustoTotal / balizConversas)}</span>
            </div>
            {/* O divisor são as conversas ABERTAS no mês (conversations.criado_em).
                O numerador é o custo INCORRIDO no mês, que inclui mensagens de
                conversas abertas em meses anteriores. Os dois não se referem
                exatamente ao mesmo conjunto — em regime estável a diferença é
                pequena, mas num mês de retomada de conversas antigas o valor
                fica superestimado. Dito na tela para o número não ser lido como
                "custo de uma conversa do início ao fim". */}
            <p style={{ color: 'var(--text-muted)' }}>
              Custo incorrido em {MESES_FULL[balizMes - 1]} ÷ conversas abertas em {MESES_FULL[balizMes - 1]}.
              Conversas abertas em meses anteriores e ainda ativas geram custo aqui sem entrar no divisor.
            </p>
          </div>
        )}

        {ehConsolidado && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            * Consolidado: custo fixo total e soma das mensalidades de {tenants.length} cliente(s).
            Selecione um cliente para ver o fechamento individual dele.
          </p>
        )}
      </div>

      {/* Tabela por cliente */}
      {selectedTenant === 'todos' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Consumo por cliente — {periodoLabel}</h2>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <Users size={13} />{clientes.length} cliente(s)
            </span>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center" style={{ background: 'var(--bg-card)' }}>
              <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
            </div>
          ) : clientes.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
              Nenhum dado de consumo encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    <th className="text-left px-5 py-3 font-medium">Cliente</th>
                    <th className="text-right px-4 py-3 font-medium">Plano</th>
                    <th className="text-right px-4 py-3 font-medium">Conversas</th>
                    <th className="text-right px-4 py-3 font-medium"><span className="flex items-center justify-end gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#10A37F' }} />OpenAI</span></th>
                    <th className="text-right px-4 py-3 font-medium"><span className="flex items-center justify-end gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#D97757' }} />Anthropic</span></th>
                    <th className="text-right px-4 py-3 font-medium">Tokens</th>
                    <th className="text-right px-4 py-3 font-medium">Inst. extras</th>
                    <th className="text-right px-5 py-3 font-medium">Custo API</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, i) => {
                    const pctOpenAI = c.total_tokens > 0 ? (c.openai_tokens / c.total_tokens) * 100 : 0
                    const plano = PLANOS[c.plano] ?? PLANOS.essencial
                    const instExtras = Math.max(0, (instanciasPorTenant[c.tenantId] ?? 0) - 1)
                    return (
                      <tr key={c.tenantId} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
                        <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.nome}</td>
                        <td className="px-4 py-3 text-right">
                          {(() => {
                            // O plano contratado continua visível — é informação de
                            // contrato. O selo ao lado diz se ele vira receita, que é
                            // outra pergunta e estava sem resposta nesta tela.
                            const tenantRow = tenants.find(t => t.id === c.tenantId)
                            const motivo = tenantRow ? semReceitaDe(tenantRow) : null
                            return (
                              <div className="flex items-center gap-1.5 justify-end flex-wrap">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{
                                    background: motivo ? 'var(--bg-hover)' : '#10B98118',
                                    color: motivo ? 'var(--text-secondary)' : '#10B981',
                                  }}>
                                  {plano.label}
                                </span>
                                {motivo && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                                    style={{
                                      background: MOTIVO_SEM_RECEITA[motivo].cor + '18',
                                      color: MOTIVO_SEM_RECEITA[motivo].cor,
                                    }}>
                                    {MOTIVO_SEM_RECEITA[motivo].label}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: '#818CF8' }}>{c.conversas_ano}</td>
                        <td className="px-4 py-3 text-right" style={{ color: '#10A37F' }}>
                          {fmtBRL(c.openai_custo)}
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{fmtTokens(c.openai_tokens)} tok</div>
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: '#D97757' }}>
                          {fmtBRL(c.anthropic_custo)}
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{fmtTokens(c.anthropic_tokens)} tok</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-14 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--border)' }}>
                              <div style={{ width: `${pctOpenAI}%`, background: '#10A37F' }} />
                              <div style={{ width: `${100 - pctOpenAI}%`, background: '#D97757' }} />
                            </div>
                            <span style={{ color: 'var(--text-secondary)' }}>{fmtTokens(c.total_tokens)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {instExtras > 0 ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#F59E0B18', color: '#F59E0B' }}>
                              {instExtras}x {fmtBRL(instExtras * CUSTO_INSTANCIA_EXTRA)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtBRL(c.total_custo)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)' }}>
                    <td className="px-5 py-3 font-bold" colSpan={2} style={{ color: 'var(--text-primary)' }}>Total</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#818CF8' }}>{totalConversasClientes}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#10A37F' }}>{fmtBRL(totalOpenAI)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#D97757' }}>{fmtBRL(totalAnthropic)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtTokens(totalTokens)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#F59E0B' }}>
                      {custoInstanciasExtras > 0 ? fmtBRL(custoInstanciasExtras) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-bold" style={{ color: 'var(--text-primary)' }}>{fmtBRL(totalCusto)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cards motor — cliente específico */}
      {selectedTenant !== 'todos' && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MotorCard nome="OpenAI" cor="#10A37F" icon={<Bot size={16} />} rows={rawData.filter(r => r.motor_utilizado === 'openai')} />
          <MotorCard nome="Anthropic" cor="#D97757" icon={<Brain size={16} />} rows={rawData.filter(r => r.motor_utilizado === 'anthropic')} />
        </div>
      )}

      {/* Modal Custos Fixos */}
      {showCustosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Custos Fixos Operacionais</h3>
              <button onClick={() => setShowCustosModal(false)}><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Valores de <strong>{MESES_FULL[balizMes - 1]}/{selectedAno}</strong>, em R$. Rateados pelo número de clientes ativos para calcular o custo por cliente.
            </p>

            {custosHerdadosDe && (
              <div className="p-3 rounded-lg text-xs" style={{ background: '#F59E0B18', border: '1px solid #F59E0B40', color: '#F59E0B' }}>
                Este mês ainda não tem lançamento próprio — os valores abaixo vieram de{' '}
                {new Date(`${custosHerdadosDe}T00:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}.
                Confira principalmente os créditos, que mudam a cada recarga, e salve para fixá-los nesta competência.
              </div>
            )}

            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Infraestrutura</p>
              <div className="grid grid-cols-2 gap-3">
                {CAMPOS_CUSTO.filter(c => c.grupo === 'infra').map(({ chave, label }) => (
                  <div key={chave}>
                    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                    <input type="number" min={0} step="0.01" value={custosFixos[chave]}
                      onChange={e => setCustosFixos(prev => ({ ...prev, [chave]: Number(e.target.value) }))}
                      className="w-full mt-1 px-3 py-1.5 rounded-lg text-sm focus:outline-none"
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Créditos de IA</p>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Quanto foi recarregado nas engines neste mês. É custo fixo e entra no rateio — não confundir
                com o &quot;Custo API&quot; dos relatórios, que é a estimativa de consumo por cliente a partir dos tokens.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {CAMPOS_CUSTO.filter(c => c.grupo === 'creditos').map(({ chave, label }) => (
                  <div key={chave}>
                    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                    <input type="number" min={0} step="0.01" value={custosFixos[chave]}
                      onChange={e => setCustosFixos(prev => ({ ...prev, [chave]: Number(e.target.value) }))}
                      className="w-full mt-1 px-3 py-1.5 rounded-lg text-sm focus:outline-none"
                      style={{ background: 'var(--bg-secondary)', border: '1px solid #10B98140', color: 'var(--text-primary)' }} />
                  </div>
                ))}
              </div>
              <p className="text-xs mt-2 font-medium" style={{ color: '#10B981' }}>
                Total recarregado: {fmtBRL(custosFixos.creditosOpenai + custosFixos.creditosAnthropic)}
              </p>
            </div>
            {/* Era um campo digitado, e ficou em 1 enquanto a base crescia: cada
                cliente passou a receber o custo fixo INTEIRO no fechamento, em
                vez da sua fatia. Um número que precisa ser mantido à mão para o
                resultado financeiro sair certo é um número que vai ficar errado.
                Agora é contado, aqui e no fechamento, pela mesma regra. */}
            <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Rateio: {clientesNoRateio} cliente(s) (automático)
              </p>
              <p>
                Contados no banco: todo cliente não arquivado que já existia em {periodoLabel}.
                Conta demo e cliente em cortesia entram no rateio — consomem a mesma
                infraestrutura, e deixá-los de fora empurraria o custo deles para quem paga.
              </p>
            </div>
            <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Instâncias extras (automático)</p>
              <p>R$ {CUSTO_INSTANCIA_EXTRA.toFixed(2)} por instância adicional (a partir da 2ª) — calculado automaticamente pelo banco.</p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Total mensal: {fmtBRL(totalFixoMensal)}
              </span>
              <span className="text-sm font-bold" style={{ color: '#10B981' }}>
                {fmtBRL(fixoPorCliente)}/cliente
              </span>
            </div>
            {erroCustos && (
              <div className="p-3 rounded-lg text-xs" style={{ background: '#EF444418', border: '1px solid #EF444440', color: '#EF4444' }}>
                {erroCustos}
              </div>
            )}

            <button
              onClick={salvarCustos}
              disabled={salvandoCustos}
              className="w-full py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
              style={{ background: '#10B981', color: '#fff' }}
            >
              {salvandoCustos ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SelectField({ value, onChange, children }: { value: string | number; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium focus:outline-none"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
    </div>
  )
}

function LegendaDot({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: cor }} />{label}
    </span>
  )
}

function KpiCard({ icon, label, value, accent, sub }: { icon: React.ReactNode; label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}18`, color: accent }}>{icon}</div>
      </div>
      <div>
        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
      </div>
    </div>
  )
}

function BalizCard({ label, value, sub, cor }: { label: string; value: string; sub?: string; cor: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: `1px solid ${cor}25` }}>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-base font-bold mt-1" style={{ color: cor }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
    </div>
  )
}

interface GraficoBarrasProps {
  series: MesData[]
  maxVal: number
  mesAtual: number
  selectedAno: number
  loading: boolean
  renderTooltip: (m: MesData) => React.ReactNode
  renderBarra: (m: MesData) => React.ReactNode
  getHeight?: (m: MesData) => number
}

function GraficoBarras({ series, maxVal, mesAtual, selectedAno, loading, renderTooltip, renderBarra, getHeight }: GraficoBarrasProps) {
  if (loading) return (
    <div className="h-40 flex items-center justify-center">
      <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
    </div>
  )
  return (
    <div className="flex items-end gap-1.5 h-40">
      {series.map((m, i) => {
        const pct = getHeight ? getHeight(m) : (m.total / maxVal) * 100
        const hasData = getHeight ? m.conversas > 0 : m.total > 0
        const isCurrent = i + 1 === mesAtual && selectedAno === new Date().getFullYear()
        return (
          <div key={m.label} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
              style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              {renderTooltip(m)}
            </div>
            <div className="w-full rounded-t-md overflow-hidden"
              style={{ height: `${Math.max(pct, hasData ? 4 : 0)}%`, minHeight: hasData ? '4px' : '2px', background: 'var(--border)' }}>
              {hasData && renderBarra(m)}
            </div>
            <span className="text-[10px] font-medium" style={{ color: isCurrent ? '#10B981' : 'var(--text-secondary)' }}>{m.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function MotorCard({ nome, cor, icon, rows }: { nome: string; cor: string; icon: React.ReactNode; rows: AiUsageRow[] }) {
  const totalCusto = rows.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalTokens = rows.reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0)
  const totalEntrada = rows.reduce((s, r) => s + r.tokens_entrada, 0)
  const totalSaida = rows.reduce((s, r) => s + r.tokens_saida, 0)
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: `1px solid ${cor}30` }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cor}18`, color: cor }}>{icon}</div>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{nome}</span>
        {rows.length === 0 && <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>Sem uso</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Custo estimado" value={fmtBRL(totalCusto)} cor={cor} />
        <Stat label="Total de tokens" value={fmtTokens(totalTokens)} cor={cor} />
        <Stat label="Tokens entrada" value={fmtTokens(totalEntrada)} cor="var(--text-secondary)" small />
        <Stat label="Tokens saída" value={fmtTokens(totalSaida)} cor="var(--text-secondary)" small />
        <Stat label="Requisições" value={String(rows.length)} cor="var(--text-secondary)" small />
      </div>
    </div>
  )
}

function Stat({ label, value, cor, small }: { label: string; value: string; cor: string; small?: boolean }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className={small ? 'text-sm font-medium mt-0.5' : 'text-base font-bold mt-0.5'} style={{ color: cor }}>{value}</p>
    </div>
  )
}
