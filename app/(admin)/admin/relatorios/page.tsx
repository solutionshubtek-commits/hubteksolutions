'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileText,
  Download,
  Mail,
  RefreshCw,
  ChevronDown,
  Users,
  MessageSquare,
  DollarSign,
  BarChart3,
  Check,
  X,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import { exportPDF } from '@/lib/exportPDF'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CicloFechado {
  id: string
  tenant_id: string
  tenant_nome: string
  mes_ref: string
  conversas: number
  tokens: number
  custo_usd: number
  custo_brl: number
  valor_cobrado: number
  fechado_em: string
}

interface TenantOption {
  id: string
  nome: string
  plano?: string
  email?: string
}

type ToastType = 'success' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const PLANOS: Record<string, { label: string; valor: number; limite: number }> = {
  essencial:  { label: 'Essencial',  valor: 397,  limite: 50   },
  acelerador: { label: 'Acelerador', valor: 597,  limite: 100  },
  dominancia: { label: 'Dominância', valor: 997,  limite: 500  },
  elite:      { label: 'Elite',      valor: 1497, limite: 1000 },
}

const CUSTO_INSTANCIA_EXTRA = 67.00

function fmtBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function fmtTokens(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`
  return String(val)
}

function mesRefLabel(mesRef: string) {
  const [ano, mes] = mesRef.split('-')
  return `${MESES_FULL[parseInt(mes) - 1]} ${ano}`
}

function mesRefShort(mesRef: string) {
  const [ano, mes] = mesRef.split('-')
  return `${MESES_LABEL[parseInt(mes) - 1]}/${String(ano).slice(2)}`
}

// Margem real: valor_cobrado + receita_inst_extras - custo_api
function calcMargem(valorCobrado: number, custoAPI: number, instExtras: number) {
  return valorCobrado + (instExtras * CUSTO_INSTANCIA_EXTRA) - custoAPI
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true)
  const [ciclos, setCiclos] = useState<CicloFechado[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [instanciasPorTenant, setInstanciasPorTenant] = useState<Record<string, number>>({})
  const [selectedTenant, setSelectedTenant] = useState<string>('todos')
  const [selectedMes, setSelectedMes] = useState<string>('todos')
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [emailModal, setEmailModal] = useState<{ ciclo?: CicloFechado; tipo: 'individual' | 'consolidado' } | null>(null)
  const [emailDestino, setEmailDestino] = useState('')

  const showToast = (msg: string, type: ToastType) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)
    try {
      const { data: tData } = await supabase.from('tenants').select('id, nome, plano').order('nome')
      setTenants((tData ?? []) as TenantOption[])

      const { data: instData } = await supabase.from('tenant_instances').select('tenant_id')
      const instMap: Record<string, number> = {}
      ;(instData ?? []).forEach((row: { tenant_id: string }) => {
        instMap[row.tenant_id] = (instMap[row.tenant_id] ?? 0) + 1
      })
      setInstanciasPorTenant(instMap)

      let query = supabase
        .from('ciclos_fechados')
        .select('*')
        .order('fechado_em', { ascending: false })
      if (selectedTenant !== 'todos') query = query.eq('tenant_id', selectedTenant)
      if (selectedMes !== 'todos') query = query.eq('mes_ref', selectedMes)

      const { data } = await query
      setCiclos((data ?? []) as CicloFechado[])
    } finally {
      setLoading(false)
    }
  }, [selectedTenant, selectedMes])

  useEffect(() => { fetchData() }, [fetchData])

  const mesesDisponiveis = Array.from(new Set(ciclos.map(c => c.mes_ref))).sort((a, b) => b.localeCompare(a))

  // ── Totais consolidados ──
  const totalConversas = ciclos.reduce((s, c) => s + c.conversas, 0)
  const totalTokens    = ciclos.reduce((s, c) => s + Number(c.tokens), 0)
  const totalCustoAPI  = ciclos.reduce((s, c) => s + Number(c.custo_brl), 0)
  const totalCobrado   = ciclos.reduce((s, c) => s + Number(c.valor_cobrado), 0)

  const totalInstanciasExtras = selectedTenant !== 'todos'
    ? Math.max(0, (instanciasPorTenant[selectedTenant] ?? 0) - 1)
    : Object.values(instanciasPorTenant).reduce((s, v) => s + Math.max(0, v - 1), 0)
  const totalReceitaInstExtras = totalInstanciasExtras * CUSTO_INSTANCIA_EXTRA

  // Margem = valor_cobrado + receita_inst_extras - custo_api
  const totalMargem = calcMargem(totalCobrado, totalCustoAPI, totalInstanciasExtras)

  const porTenant: Record<string, { nome: string; plano: string; ciclos: CicloFechado[] }> = {}
  ciclos.forEach(c => {
    if (!porTenant[c.tenant_id]) {
      const t = tenants.find(t => t.id === c.tenant_id)
      porTenant[c.tenant_id] = { nome: c.tenant_nome, plano: t?.plano ?? 'essencial', ciclos: [] }
    }
    porTenant[c.tenant_id].ciclos.push(c)
  })

  // ── Helpers de export ──
  function getNomeRelatorio() {
    return selectedTenant !== 'todos'
      ? tenants.find(t => t.id === selectedTenant)?.nome ?? 'Cliente'
      : 'Consolidado'
  }

  function getPeriodoLabel() {
    if (selectedMes !== 'todos') return mesRefLabel(selectedMes)
    if (mesesDisponiveis.length === 0) return 'Todos os períodos'
    if (mesesDisponiveis.length === 1) return mesRefLabel(mesesDisponiveis[0])
    return `${mesRefLabel(mesesDisponiveis[mesesDisponiveis.length - 1])} a ${mesRefLabel(mesesDisponiveis[0])}`
  }

  function getValorClientePorCiclo(c: CicloFechado) {
    const instExtras = Math.max(0, (instanciasPorTenant[c.tenant_id] ?? 0) - 1)
    return Number(c.valor_cobrado) + (instExtras * CUSTO_INSTANCIA_EXTRA)
  }

  // ── Export CSV (visão cliente — sem custos internos) ──
  function exportCSV() {
    const linhas = [
      ['Cliente', 'Mês', 'Conversas', 'Tokens', 'Plano', 'Instâncias extras', 'Valor a pagar (R$)'],
      ...ciclos.map(c => {
        const instExtras = Math.max(0, (instanciasPorTenant[c.tenant_id] ?? 0) - 1)
        const valorCliente = Number(c.valor_cobrado) + (instExtras * CUSTO_INSTANCIA_EXTRA)
        return [
          c.tenant_nome,
          mesRefLabel(c.mes_ref),
          c.conversas,
          fmtTokens(Number(c.tokens)),
          fmtBRL(Number(c.valor_cobrado)),
          instExtras > 0 ? `${instExtras}x ${fmtBRL(instExtras * CUSTO_INSTANCIA_EXTRA)}` : '—',
          fmtBRL(valorCliente).replace('R$\u00a0', '').replace('.', '').replace(',', '.'),
        ]
      })
    ]
    const csv = linhas.map(l => l.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${getNomeRelatorio().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Export TXT (visão cliente) ──
  function exportTXT() {
    const nome = getNomeRelatorio()
    const periodo = getPeriodoLabel()
    const pad = (s: string, n: number) => s.padEnd(n, ' ')

    const linhas = [
      `RELATÓRIO DE CONSUMO — HUBTEK SOLUTIONS`,
      `Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      `Cliente: ${nome} · Período: ${periodo}`,
      ``,
      `─────────────────────────────────────────────────────────────`,
      `${pad('Mês', 15)} ${pad('Conversas', 12)} ${pad('Tokens', 12)} ${pad('Plano', 14)} ${pad('Inst. extras', 15)} ${'Valor a pagar'.padStart(14)}`,
      `─────────────────────────────────────────────────────────────`,
      ...ciclos.map(c => {
        const instExtras = Math.max(0, (instanciasPorTenant[c.tenant_id] ?? 0) - 1)
        const valorCliente = Number(c.valor_cobrado) + (instExtras * CUSTO_INSTANCIA_EXTRA)
        const instLabel = instExtras > 0 ? `${instExtras}x ${fmtBRL(instExtras * CUSTO_INSTANCIA_EXTRA)}` : '—'
        return `${pad(mesRefShort(c.mes_ref), 15)} ${pad(String(c.conversas), 12)} ${pad(fmtTokens(Number(c.tokens)), 12)} ${pad(fmtBRL(Number(c.valor_cobrado)), 14)} ${pad(instLabel, 15)} ${fmtBRL(valorCliente).padStart(14)}`
      }),
      `─────────────────────────────────────────────────────────────`,
      `${pad('TOTAL', 15)} ${pad(String(totalConversas), 12)} ${pad(fmtTokens(totalTokens), 12)} ${pad(fmtBRL(totalCobrado), 14)} ${pad(totalReceitaInstExtras > 0 ? fmtBRL(totalReceitaInstExtras) : '—', 15)} ${fmtBRL(totalCobrado + totalReceitaInstExtras).padStart(14)}`,
      ``,
      `─────────────────────────────────────────────────────────────`,
      `Hubtek Solutions — app.hubteksolutions.tech`,
      `Suporte: wa.me/5551980104924`,
    ]

    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${nome.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Export PDF (visão cliente) ──
  function exportarPDF() {
    const nome = getNomeRelatorio()
    const periodo = getPeriodoLabel()

    exportPDF({
      titulo: 'Relatório de Consumo',
      subtitulo: `Cliente: ${nome} · Período: ${periodo}`,
      colunas: [
        { label: 'Mês',           key: 'mes',        align: 'left'  },
        { label: 'Conversas',     key: 'conversas',  align: 'right' },
        { label: 'Tokens',        key: 'tokens',     align: 'right' },
        { label: 'Plano',         key: 'plano',      align: 'right' },
        { label: 'Inst. extras',  key: 'instExtras', align: 'right' },
        { label: 'Valor a pagar', key: 'valorTotal', align: 'right' },
      ],
      linhas: ciclos.map(c => {
        const instExtras = Math.max(0, (instanciasPorTenant[c.tenant_id] ?? 0) - 1)
        const valorCliente = Number(c.valor_cobrado) + (instExtras * CUSTO_INSTANCIA_EXTRA)
        return {
          mes:        mesRefLabel(c.mes_ref),
          conversas:  c.conversas,
          tokens:     fmtTokens(Number(c.tokens)),
          plano:      fmtBRL(Number(c.valor_cobrado)),
          instExtras: instExtras > 0 ? `${instExtras}x ${fmtBRL(instExtras * CUSTO_INSTANCIA_EXTRA)}` : '—',
          valorTotal: fmtBRL(valorCliente),
        }
      }),
      totais: {
        mes:        'TOTAL',
        conversas:  totalConversas,
        tokens:     fmtTokens(totalTokens),
        plano:      fmtBRL(totalCobrado),
        instExtras: totalReceitaInstExtras > 0 ? fmtBRL(totalReceitaInstExtras) : '—',
        valorTotal: fmtBRL(totalCobrado + totalReceitaInstExtras),
      },
      nomeArquivo: `relatorio_${nome.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`,
    })
  }

  // ── Enviar email ──
  async function enviarEmail() {
    if (!emailDestino || !emailModal) return
    const mesParaEnviar = selectedMes !== 'todos' ? selectedMes : mesesDisponiveis[0]
    if (!mesParaEnviar) { showToast('Selecione um mês para enviar.', 'error'); return }

    const key = emailModal.tipo === 'individual' ? emailModal.ciclo?.id ?? 'consolidado' : 'consolidado'
    setEnviando(key)

    try {
      const ciclosParaEnviar = emailModal.tipo === 'consolidado'
        ? ciclos.filter(c => c.mes_ref === mesParaEnviar)
        : ciclos.filter(c => c.tenant_id === emailModal.ciclo?.tenant_id && c.mes_ref === mesParaEnviar)

      const tenant = emailModal.tipo === 'individual'
        ? tenants.find(t => t.id === emailModal.ciclo?.tenant_id)
        : null

      // Enriquece ciclos com valor_cliente para o email
      const ciclosEnriquecidos = ciclosParaEnviar.map(c => {
        const instExtras = Math.max(0, (instanciasPorTenant[c.tenant_id] ?? 0) - 1)
        return {
          ...c,
          instancias_extras: instExtras,
          custo_instancias_extras: instExtras * CUSTO_INSTANCIA_EXTRA,
          valor_cliente: Number(c.valor_cobrado) + (instExtras * CUSTO_INSTANCIA_EXTRA),
        }
      })

      const res = await fetch('/api/admin/enviar-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant?.id ?? null,
          tenant_nome: tenant?.nome ?? null,
          email_destino: emailDestino,
          mes_ref: mesParaEnviar,
          ciclos: ciclosEnriquecidos,
          modo_cliente: true,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast('Relatório enviado com sucesso!', 'success')
      setEmailModal(null)
      setEmailDestino('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao enviar.', 'error')
    } finally {
      setEnviando(null)
    }
  }

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>

      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium"
          style={{ background: toast.type === 'success' ? '#10B981' : '#EF4444', color: '#fff', minWidth: '280px' }}>
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Relatórios</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Ciclos fechados · exportação e envio por email
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SelectField value={selectedTenant} onChange={v => setSelectedTenant(v)}>
            <option value="todos">Todos os clientes</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </SelectField>
          <SelectField value={selectedMes} onChange={v => setSelectedMes(v)}>
            <option value="todos">Todos os meses</option>
            {mesesDisponiveis.map(m => <option key={m} value={m}>{mesRefLabel(m)}</option>)}
          </SelectField>
          <button onClick={fetchData} className="p-2 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <RefreshCw size={16} style={{ color: 'var(--text-secondary)' }} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <Download size={14} /> CSV
          </button>
          <button onClick={exportTXT}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <FileText size={14} /> TXT
          </button>
          <button onClick={exportarPDF}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <FileText size={14} /> PDF
          </button>
          <button
            onClick={() => { setEmailModal({ tipo: selectedTenant !== 'todos' ? 'individual' : 'consolidado' }); setEmailDestino('') }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: '#10B981', color: '#fff' }}>
            <Mail size={14} /> Enviar por email
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={<FileText size={18} />}     label="Ciclos fechados"   value={String(ciclos.length)}                accent="#6366F1" />
        <KpiCard icon={<MessageSquare size={18} />} label="Total conversas"   value={totalConversas.toLocaleString('pt-BR')} accent="#818CF8" />
        <KpiCard icon={<BarChart3 size={18} />}     label="Tokens consumidos" value={fmtTokens(totalTokens)}                accent="#8B5CF6" />
        <KpiCard icon={<DollarSign size={18} />}    label="Custo API total"   value={fmtBRL(totalCustoAPI)}                 accent="#10A37F"
          sub={totalReceitaInstExtras > 0 ? `+ ${fmtBRL(totalReceitaInstExtras)} inst. extras` : undefined} />
        <KpiCard icon={<TrendingUp size={18} />}    label="Margem estimada"
          value={fmtBRL(totalMargem)}
          accent={totalMargem >= 0 ? '#10B981' : '#EF4444'}
          sub="plano + inst. extras − custo API" />
      </div>

      {/* Resumo consolidado do período */}
      {ciclos.length > 0 && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Resumo consolidado — {getPeriodoLabel()}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Visão financeira real do período selecionado
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <BalizCard label="Conversas iniciadas" value={String(totalConversas)}      sub="no período"             cor="#6366F1" />
            <BalizCard label="Tokens consumidos"   value={fmtTokens(totalTokens)}     sub="no período"             cor="#8B5CF6" />
            <BalizCard label="Custo API"            value={fmtBRL(totalCustoAPI)}       sub="custo operacional"      cor="#10A37F" />
            <BalizCard label="Receita planos"       value={fmtBRL(totalCobrado)}        sub="valor cobrado"          cor="#10B981" />
            <BalizCard
              label="Inst. extras"
              value={totalReceitaInstExtras > 0 ? fmtBRL(totalReceitaInstExtras) : '—'}
              sub={totalInstanciasExtras > 0 ? `${totalInstanciasExtras}x R$${CUSTO_INSTANCIA_EXTRA}` : 'nenhuma'}
              cor="#F59E0B"
            />
            <BalizCard
              label="Margem real"
              value={fmtBRL(totalMargem)}
              sub="plano + extras − API"
              cor={totalMargem >= 0 ? '#10B981' : '#EF4444'}
            />
          </div>
          {totalInstanciasExtras > 0 && (
            <div className="flex items-center gap-2 text-xs pt-1" style={{ color: 'var(--text-secondary)' }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#F59E0B' }} />
              Instâncias extras geram receita adicional de {fmtBRL(totalReceitaInstExtras)}/mês · {totalInstanciasExtras}x R${CUSTO_INSTANCIA_EXTRA.toFixed(2)} por instância adicional (a partir da 2ª)
            </div>
          )}
        </div>
      )}

      {/* Tabela ciclos fechados — visão interna */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-2"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Ciclos fechados {selectedMes !== 'todos' ? `· ${mesRefLabel(selectedMes)}` : ''}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Visão interna — inclui custo API e margem real
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Users size={13} />{ciclos.length} registro(s)
          </span>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center" style={{ background: 'var(--bg-card)' }}>
            <RefreshCw size={22} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
          </div>
        ) : ciclos.length === 0 ? (
          <div className="p-10 text-center" style={{ background: 'var(--bg-card)' }}>
            <FileText size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum ciclo fechado encontrado.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Use o botão &quot;Fechar ciclo&quot; na Visão Geral do Admin.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  <th className="text-left px-5 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Plano</th>
                  <th className="text-left px-4 py-3 font-medium">Mês</th>
                  <th className="text-right px-4 py-3 font-medium">Conversas</th>
                  <th className="text-right px-4 py-3 font-medium">Tokens</th>
                  <th className="text-right px-4 py-3 font-medium">Custo API</th>
                  <th className="text-right px-4 py-3 font-medium">Plano cobrado</th>
                  <th className="text-right px-4 py-3 font-medium">Inst. extras</th>
                  <th className="text-right px-4 py-3 font-medium">Margem real</th>
                  <th className="text-center px-5 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ciclos.map((c, i) => {
                  const plano = PLANOS[tenants.find(t => t.id === c.tenant_id)?.plano ?? 'essencial'] ?? PLANOS.essencial
                  const instExtras = Math.max(0, (instanciasPorTenant[c.tenant_id] ?? 0) - 1)
                  const receitaInstExtras = instExtras * CUSTO_INSTANCIA_EXTRA
                  const margem = calcMargem(Number(c.valor_cobrado), Number(c.custo_brl), instExtras)
                  const isEnviando = enviando === c.id
                  return (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
                      <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.tenant_nome}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#10B98118', color: '#10B981' }}>
                          {plano.label}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{mesRefLabel(c.mes_ref)}</td>
                      <td className="px-4 py-3 text-right" style={{ color: '#818CF8' }}>{c.conversas}</td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>{fmtTokens(Number(c.tokens))}</td>
                      <td className="px-4 py-3 text-right" style={{ color: '#EF4444' }}>{fmtBRL(Number(c.custo_brl))}</td>
                      <td className="px-4 py-3 text-right" style={{ color: '#10B981' }}>{fmtBRL(Number(c.valor_cobrado))}</td>
                      <td className="px-4 py-3 text-right">
                        {instExtras > 0 ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#F59E0B18', color: '#F59E0B' }}>
                            +{fmtBRL(receitaInstExtras)}
                          </span>
                        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: margem >= 0 ? '#10B981' : '#EF4444' }}>
                        {fmtBRL(margem)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            title="Enviar relatório ao cliente por email"
                            onClick={() => { setEmailModal({ ciclo: c, tipo: 'individual' }); setEmailDestino('') }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                            disabled={isEnviando}>
                            {isEnviando ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                            Email
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)' }}>
                  <td className="px-5 py-3 font-bold" colSpan={3} style={{ color: 'var(--text-primary)' }}>Total</td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: '#818CF8' }}>{totalConversas}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtTokens(totalTokens)}</td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: '#EF4444' }}>{fmtBRL(totalCustoAPI)}</td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: '#10B981' }}>{fmtBRL(totalCobrado)}</td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: '#F59E0B' }}>
                    {totalReceitaInstExtras > 0 ? `+${fmtBRL(totalReceitaInstExtras)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: totalMargem >= 0 ? '#10B981' : '#EF4444' }}>{fmtBRL(totalMargem)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Resumo por cliente */}
      {selectedTenant === 'todos' && Object.keys(porTenant).length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Resumo por cliente</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  <th className="text-left px-5 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Plano</th>
                  <th className="text-right px-4 py-3 font-medium">Ciclos</th>
                  <th className="text-right px-4 py-3 font-medium">Conversas</th>
                  <th className="text-right px-4 py-3 font-medium">Custo API</th>
                  <th className="text-right px-4 py-3 font-medium">Plano cobrado</th>
                  <th className="text-right px-4 py-3 font-medium">Inst. extras</th>
                  <th className="text-right px-5 py-3 font-medium">Margem real</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(porTenant).map(([tid, t], i) => {
                  const plano = PLANOS[t.plano] ?? PLANOS.essencial
                  const conv   = t.ciclos.reduce((s, c) => s + c.conversas, 0)
                  const custo  = t.ciclos.reduce((s, c) => s + Number(c.custo_brl), 0)
                  const cobrado = t.ciclos.reduce((s, c) => s + Number(c.valor_cobrado), 0)
                  const instExtras = Math.max(0, (instanciasPorTenant[tid] ?? 0) - 1)
                  const receita = instExtras * CUSTO_INSTANCIA_EXTRA
                  const margem = calcMargem(cobrado, custo, instExtras)
                  return (
                    <tr key={tid} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
                      <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{t.nome}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#10B98118', color: '#10B981' }}>{plano.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>{t.ciclos.length}</td>
                      <td className="px-4 py-3 text-right" style={{ color: '#818CF8' }}>{conv}</td>
                      <td className="px-4 py-3 text-right" style={{ color: '#EF4444' }}>{fmtBRL(custo)}</td>
                      <td className="px-4 py-3 text-right" style={{ color: '#10B981' }}>{fmtBRL(cobrado)}</td>
                      <td className="px-4 py-3 text-right">
                        {instExtras > 0 ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#F59E0B18', color: '#F59E0B' }}>
                            +{fmtBRL(receita)}
                          </span>
                        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold" style={{ color: margem >= 0 ? '#10B981' : '#EF4444' }}>{fmtBRL(margem)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal email */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  {emailModal.tipo === 'consolidado' ? 'Enviar relatório consolidado' : `Enviar relatório — ${emailModal.ciclo?.tenant_nome}`}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {selectedMes !== 'todos' ? mesRefLabel(selectedMes) : mesesDisponiveis[0] ? mesRefLabel(mesesDisponiveis[0]) : 'Mês mais recente'}
                </p>
              </div>
              <button onClick={() => setEmailModal(null)}>
                <X size={18} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Email de destino</label>
              <input
                type="email"
                placeholder="cliente@empresa.com"
                value={emailDestino}
                onChange={e => setEmailDestino(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                onKeyDown={e => e.key === 'Enter' && enviarEmail()}
                autoFocus
              />
            </div>

            <div className="p-3 rounded-lg text-xs space-y-1" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>O cliente receberá:</p>
              <p>· Total de conversas e tokens do período</p>
              <p>· Valor do plano contratado</p>
              <p>· Instâncias extras (se houver)</p>
              <p>· Total a pagar</p>
              <p className="mt-1 italic">Custos internos não são exibidos ao cliente.</p>
              <p>· Enviado de: noreply@hubteksolutions.tech</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEmailModal(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={enviarEmail} disabled={!emailDestino || enviando !== null}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: '#10B981', color: '#fff' }}>
                {enviando !== null ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : <><Mail size={14} /> Enviar</>}
              </button>
            </div>
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
