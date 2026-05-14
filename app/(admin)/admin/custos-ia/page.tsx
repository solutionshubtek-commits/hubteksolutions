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

// ─── Planos ───────────────────────────────────────────────────────────────────

const PLANOS: Record<string, { label: string; limite: number; valor: number }> = {
  essencial:  { label: 'Essencial',  limite: 50,   valor: 397  },
  acelerador: { label: 'Acelerador', limite: 100,  valor: 597  },
  dominancia: { label: 'Dominância', limite: 500,  valor: 997  },
  elite:      { label: 'Elite',      limite: 1000, valor: 1497 },
}

const CUSTO_INSTANCIA_EXTRA = 67.00

const CUSTOS_FIXOS_DEFAULT = {
  vercel: 98.27,
  supabase: 122.83,
  vps: 33.00,
  dominio: 12.81,
  claudePro: 120.00,
  github: 19.65,
  resend: 98.27,
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
  const [rawData, setRawData] = useState<AiUsageRow[]>([])
  const [conversasPorMes, setConversasPorMes] = useState<Record<string, number>>({})
  const [instanciasPorTenant, setInstanciasPorTenant] = useState<Record<string, number>>({})
  const [showCustosModal, setShowCustosModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [custosFixos, setCustosFixos] = useState<CustosFixos>(CUSTOS_FIXOS_DEFAULT)
  const [numClientes, setNumClientes] = useState(1)
  const [exportMes, setExportMes] = useState<number>(new Date().getMonth() + 1)

  const anosDisponiveis = Array.from(new Set(rawData.map(r => r.ciclo_ano))).sort((a, b) => b - a)
  if (anosDisponiveis.length === 0) anosDisponiveis.push(new Date().getFullYear())

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)
    try {
      const { data: tData } = await supabase.from('tenants').select('id, nome, plano').order('nome')
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

      const porMes: Record<string, number> = {}
      ;(convData ?? []).forEach((c: { criado_em: string }) => {
        const mes = String(new Date(c.criado_em).getMonth() + 1)
        porMes[mes] = (porMes[mes] ?? 0) + 1
      })
      setConversasPorMes(porMes)
    } finally {
      setLoading(false)
    }
  }, [selectedTenant, selectedAno])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derivados ──

  const totalCusto = rawData.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalTokens = rawData.reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0)
  const totalOpenAI = rawData.filter(r => r.motor_utilizado === 'openai').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalAnthropic = rawData.filter(r => r.motor_utilizado === 'anthropic').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalConversasAno = Object.values(conversasPorMes).reduce((s, v) => s + v, 0)
  const totalFixoMensal = Object.values(custosFixos).reduce((s, v) => s + v, 0)
  const fixoPorCliente = numClientes > 0 ? totalFixoMensal / numClientes : totalFixoMensal

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
    rawData.forEach(r => {
      const nome = getTenantNome(r.tenants)
      const planoRaw = Array.isArray(r.tenants) ? r.tenants[0]?.plano : (r.tenants as { plano?: string } | null)?.plano
      const plano = planoRaw ?? 'essencial'
      if (!clienteMap[r.tenant_id]) {
        clienteMap[r.tenant_id] = { tenantId: r.tenant_id, nome, plano, openai_tokens: 0, anthropic_tokens: 0, openai_custo: 0, anthropic_custo: 0, total_custo: 0, total_tokens: 0, conversas_ano: 0 }
      }
      const t = clienteMap[r.tenant_id]
      const tok = r.tokens_entrada + r.tokens_saida
      const custo = Number(r.custo_estimado_reais)
      t.total_tokens += tok; t.total_custo += custo
      if (r.motor_utilizado === 'openai') { t.openai_tokens += tok; t.openai_custo += custo }
      else { t.anthropic_tokens += tok; t.anthropic_custo += custo }
    })
  }
  const clientes = Object.values(clienteMap).sort((a, b) => b.total_custo - a.total_custo)

  const mesAtual = new Date().getMonth() + 1
  const varPct = (() => {
    const cur = seriesMensal[mesAtual - 1]?.total ?? 0
    const prev = mesAtual > 1 ? (seriesMensal[mesAtual - 2]?.total ?? 0) : 0
    return prev > 0 ? ((cur - prev) / prev) * 100 : null
  })()

  // ── Balizador do mês selecionado ──
  const balizTenant = tenants.find(t => t.id === selectedTenant)
  const balizPlanoKey = balizTenant?.plano ?? 'essencial'
  const balizPlano = PLANOS[balizPlanoKey] ?? PLANOS.essencial
  const balizRows = rawData.filter(r => r.ciclo_mes === exportMes)
  const balizConversas = conversasPorMes[String(exportMes)] ?? 0
  const balizCustoAPI = balizRows.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const balizInstanciasExtras = selectedTenant !== 'todos'
    ? Math.max(0, (instanciasPorTenant[selectedTenant] ?? 0) - 1)
    : Object.values(instanciasPorTenant).reduce((s, v) => s + Math.max(0, v - 1), 0)
  const balizCustoInstExtras = balizInstanciasExtras * CUSTO_INSTANCIA_EXTRA
  // Custo operacional = API + fixo (inst. extras sao receita, nao custo)
  const balizCustoTotal = balizCustoAPI + fixoPorCliente
  // Margem = valor_plano + receita_inst_extras - custo_fixo - custo_API
  const balizMargem = balizPlano.valor + balizCustoInstExtras - fixoPorCliente - balizCustoAPI
  const balizMargemPct = balizPlano.valor > 0 ? (balizMargem / balizPlano.valor) * 100 : 0
  const balizCustoPorConv = balizConversas > 0 ? balizCustoAPI / balizConversas : 0

  // ── Export TXT ──
  function exportarFechamento() {
    const tenant = tenants.find(t => t.id === selectedTenant)
    const nomeCliente = tenant?.nome ?? 'Consolidado'
    const planoKey = tenant?.plano ?? 'essencial'
    const plano = PLANOS[planoKey] ?? PLANOS.essencial
    const mesRows = rawData.filter(r => r.ciclo_mes === exportMes)
    const conversas = conversasPorMes[String(exportMes)] ?? 0
    const tokens = mesRows.reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0)
    const custoAPI = mesRows.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
    const instExtras = selectedTenant !== 'todos'
      ? Math.max(0, (instanciasPorTenant[selectedTenant] ?? 0) - 1)
      : Object.values(instanciasPorTenant).reduce((s, v) => s + Math.max(0, v - 1), 0)
    const custoInstExtras = instExtras * CUSTO_INSTANCIA_EXTRA
    const custoTotal = custoAPI + fixoPorCliente + custoInstExtras
    const margem = plano.valor - custoTotal
    const custoPorConv = conversas > 0 ? custoAPI / conversas : 0
    const mesNome = `${MESES_FULL[exportMes - 1]} ${selectedAno}`
    const pad = (s: string, n: number) => s.padEnd(n, ' ')

    const linhas = [
      `FECHAMENTO MENSAL — HUBTEK SOLUTIONS`,
      `Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      ``,
      `Cliente: ${nomeCliente} — ${mesNome}`,
      `Plano: ${plano.label} (até ${plano.limite} conversas/mês)`,
      `─────────────────────────────────────`,
      `${pad('Conversas iniciadas:', 25)} ${conversas}`,
      `${pad('Total de tokens:', 25)} ${tokens.toLocaleString('pt-BR')}`,
      `${pad('Custo estimado (API):', 25)} ${fmtBRL(custoAPI)}`,
      `${pad('Custo fixo rateado:', 25)} ${fmtBRL(fixoPorCliente)}`,
      ...(instExtras > 0 ? [`${pad('Instâncias extras:', 25)} ${instExtras}x ${fmtBRL(CUSTO_INSTANCIA_EXTRA)} = ${fmtBRL(custoInstExtras)}`] : []),
      `${pad('Custo total operacional:', 25)} ${fmtBRL(custoTotal)}`,
      `─────────────────────────────────────`,
      `${pad('Valor do plano:', 25)} ${fmtBRL(plano.valor)}`,
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
      `Total fixo: ${fmtBRL(totalFixoMensal)} ÷ ${numClientes} cliente(s) = ${fmtBRL(fixoPorCliente)}/cliente`,
      ...(instExtras > 0 ? [`Instâncias extras: ${instExtras}x R$ ${CUSTO_INSTANCIA_EXTRA.toFixed(2)} = ${fmtBRL(custoInstExtras)}`] : []),
      ``,
      `─────────────────────────────────────`,
      `Hubtek Solutions — app.hubteksolutions.tech`,
    ]

    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fechamento_${nomeCliente.replace(/\s+/g, '_')}_${MESES_LABEL[exportMes - 1]}${selectedAno}.txt`
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
    const mesRows = rawData.filter(r => r.ciclo_mes === exportMes)
    const conversas = conversasPorMes[String(exportMes)] ?? 0
    const custoAPI = mesRows.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
    const instExtras = selectedTenant !== 'todos'
      ? Math.max(0, (instanciasPorTenant[selectedTenant] ?? 0) - 1)
      : Object.values(instanciasPorTenant).reduce((s, v) => s + Math.max(0, v - 1), 0)
    const custoInstExtras = instExtras * CUSTO_INSTANCIA_EXTRA
    const custoTotal = custoAPI + fixoPorCliente + custoInstExtras
    const margem = plano.valor - custoTotal
    const mesNome = `${MESES_FULL[exportMes - 1]} ${selectedAno}`

    const linhasPDF = [
      { descricao: 'Conversas iniciadas',     valor: conversas },
      { descricao: 'Custo estimado (API)',     valor: fmtBRL(custoAPI) },
      { descricao: 'Custo fixo rateado',       valor: fmtBRL(fixoPorCliente) },
      ...(instExtras > 0 ? [{ descricao: `Instâncias extras (${instExtras}x R$${CUSTO_INSTANCIA_EXTRA})`, valor: fmtBRL(custoInstExtras) }] : []),
      { descricao: 'Custo total operacional',  valor: fmtBRL(custoTotal) },
      { descricao: 'Valor do plano',           valor: fmtBRL(plano.valor) },
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
      nomeArquivo: `fechamento_${nomeCliente.replace(/\s+/g, '_')}_${MESES_LABEL[exportMes - 1]}${selectedAno}`,
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
        <KpiCard icon={<DollarSign size={18} />} label="Custo Total no Ano" value={fmtBRL(totalCusto)} accent="#10B981" />
        <KpiCard icon={<MessageSquare size={18} />} label="Conversas no Ano" value={totalConversasAno.toLocaleString('pt-BR')} accent="#6366F1"
          sub={totalConversasAno > 0 ? `~${fmtBRL(totalCusto / totalConversasAno)}/conversa` : undefined} />
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
            <LegendaDot cor="#6366F1" label="Conversas iniciadas" />
          </div>
          <GraficoBarras series={seriesMensal} maxVal={maxBarConv} mesAtual={mesAtual} selectedAno={selectedAno} loading={loading}
            getHeight={m => (m.conversas / maxBarConv) * 100}
            renderTooltip={m => (<><div className="font-semibold mb-0.5">{m.label}</div><div style={{ color: '#818CF8' }}>{m.conversas} conversa{m.conversas !== 1 ? 's' : ''}</div>{m.conversas > 0 && m.total > 0 && <div className="text-gray-400 text-xs mt-1">{fmtBRL(m.total / m.conversas)}/conversa</div>}</>)}
            renderBarra={m => m.conversas > 0 ? (<div className="w-full h-full" style={{ background: 'linear-gradient(to top, #4F46E5, #818CF8)' }} />) : null}
          />
        </div>
      </div>

      {/* Balizador de cobrança */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Balizador de cobrança</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Referência para fechamento mensal</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SelectField value={exportMes} onChange={v => setExportMes(Number(v))}>
              {MESES_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </SelectField>
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
          <BalizCard label="Conversas" value={String(balizConversas)} sub={`/ ${balizPlano.limite} limite`} cor="#6366F1" />
          <BalizCard label="Custo API" value={fmtBRL(balizCustoAPI)} sub="tokens consumidos" cor="#10A37F" />
          <BalizCard label="Custo fixo rateado" value={fmtBRL(fixoPorCliente)} sub={`${numClientes} cliente(s)`} cor="#8B5CF6" />
          <BalizCard
            label="Instâncias extras"
            value={balizInstanciasExtras > 0 ? fmtBRL(balizCustoInstExtras) : '—'}
            sub={balizInstanciasExtras > 0 ? `${balizInstanciasExtras}x R$${CUSTO_INSTANCIA_EXTRA}` : 'nenhuma'}
            cor={balizInstanciasExtras > 0 ? '#F59E0B' : 'var(--text-secondary)'}
          />
          <BalizCard label="Custo operacional" value={fmtBRL(balizCustoTotal)} sub="API + fixo" cor="#F59E0B" />
          <BalizCard label="Valor do plano" value={fmtBRL(balizPlano.valor)} sub={balizPlano.label} cor="#10B981" />
          <BalizCard label="Margem estimada" value={fmtBRL(balizMargem)} sub={`${balizMargemPct.toFixed(0)}% do plano`} cor={balizMargem >= 0 ? '#10B981' : '#EF4444'} />
        </div>

        {balizCustoPorConv > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <span>Custo médio por conversa (API):</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtBRL(balizCustoPorConv)}</span>
            <span className="ml-4">Custo total por conversa (API + fixo):</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{balizConversas > 0 ? fmtBRL(balizCustoTotal / balizConversas) : '—'}</span>
          </div>
        )}

        {selectedTenant === 'todos' && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            * Selecione um cliente específico para aplicar o plano contratado no balizador.
          </p>
        )}
      </div>

      {/* Tabela por cliente */}
      {selectedTenant === 'todos' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Consumo por cliente — {selectedAno}</h2>
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
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#10B98118', color: '#10B981' }}>{plano.label}</span>
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
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#818CF8' }}>{totalConversasAno}</td>
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
              Valores mensais em R$. Rateados pelo número de clientes ativos para calcular o custo por cliente.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(custosFixos) as (keyof CustosFixos)[]).map(k => (
                <div key={k}>
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {k === 'claudePro' ? 'Claude Pro' : k.charAt(0).toUpperCase() + k.slice(1)}
                  </label>
                  <input type="number" value={custosFixos[k]}
                    onChange={e => setCustosFixos(prev => ({ ...prev, [k]: Number(e.target.value) }))}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg text-sm focus:outline-none"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Nº de clientes ativos (para rateio)</label>
              <input type="number" min={1} value={numClientes}
                onChange={e => setNumClientes(Math.max(1, Number(e.target.value)))}
                className="w-full mt-1 px-3 py-1.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
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
            <button onClick={() => setShowCustosModal(false)} className="w-full py-2 rounded-lg text-sm font-semibold" style={{ background: '#10B981', color: '#fff' }}>
              Salvar
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
