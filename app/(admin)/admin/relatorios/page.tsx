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

const PLANOS: Record<string, { label: string; valor: number }> = {
  essencial:  { label: 'Essencial',  valor: 397  },
  acelerador: { label: 'Acelerador', valor: 597  },
  dominancia: { label: 'Dominância', valor: 997  },
  elite:      { label: 'Elite',      valor: 1497 },
}

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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true)
  const [ciclos, setCiclos] = useState<CicloFechado[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
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
      const { data: tData } = await supabase
        .from('tenants')
        .select('id, nome, plano')
        .order('nome')
      setTenants((tData ?? []) as TenantOption[])

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

  // Meses disponíveis
  const mesesDisponiveis = Array.from(new Set(ciclos.map(c => c.mes_ref))).sort((a, b) => b.localeCompare(a))

  // KPIs dos ciclos filtrados
  const totalConversas = ciclos.reduce((s, c) => s + c.conversas, 0)
  const totalTokens = ciclos.reduce((s, c) => s + Number(c.tokens), 0)
  const totalCustoBRL = ciclos.reduce((s, c) => s + Number(c.custo_brl), 0)
  const totalCobrado = ciclos.reduce((s, c) => s + Number(c.valor_cobrado), 0)
  const totalMargem = totalCobrado - totalCustoBRL

  // Agrupamento por tenant para visão consolidada
  const porTenant: Record<string, { nome: string; plano: string; ciclos: CicloFechado[] }> = {}
  ciclos.forEach(c => {
    if (!porTenant[c.tenant_id]) {
      const t = tenants.find(t => t.id === c.tenant_id)
      porTenant[c.tenant_id] = { nome: c.tenant_nome, plano: t?.plano ?? 'essencial', ciclos: [] }
    }
    porTenant[c.tenant_id].ciclos.push(c)
  })

  // ── Export CSV ──
  function exportCSV() {
    const linhas = [
      ['Cliente','Mês','Conversas','Tokens','Custo API (R$)','Valor Cobrado (R$)','Margem (R$)','Fechado em'],
      ...ciclos.map(c => [
        c.tenant_nome,
        mesRefLabel(c.mes_ref),
        c.conversas,
        c.tokens,
        Number(c.custo_brl).toFixed(2).replace('.', ','),
        Number(c.valor_cobrado).toFixed(2).replace('.', ','),
        (Number(c.valor_cobrado) - Number(c.custo_brl)).toFixed(2).replace('.', ','),
        new Date(c.fechado_em).toLocaleDateString('pt-BR'),
      ])
    ]
    const csv = linhas.map(l => l.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const suffix = selectedTenant !== 'todos'
      ? tenants.find(t => t.id === selectedTenant)?.nome?.replace(/\s+/g, '_') ?? 'cliente'
      : 'consolidado'
    a.download = `relatorio_${suffix}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Export TXT ──
  function exportTXT() {
    const nomeRelatorio = selectedTenant !== 'todos'
      ? tenants.find(t => t.id === selectedTenant)?.nome ?? 'Cliente'
      : 'Consolidado'

    const linhas = [
      `RELATÓRIO DE CONSUMO — HUBTEK SOLUTIONS`,
      `Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      `Filtro: ${nomeRelatorio}${selectedMes !== 'todos' ? ` · ${mesRefLabel(selectedMes)}` : ''}`,
      ``,
      `─────────────────────────────────────────────────────`,
      `${'Cliente'.padEnd(20)} ${'Mês'.padEnd(15)} ${'Conv'.padStart(6)} ${'Tokens'.padStart(10)} ${'Custo API'.padStart(14)} ${'Cobrado'.padStart(12)}`,
      `─────────────────────────────────────────────────────`,
      ...ciclos.map(c =>
        `${c.tenant_nome.substring(0, 20).padEnd(20)} ${mesRefShort(c.mes_ref).padEnd(15)} ${String(c.conversas).padStart(6)} ${fmtTokens(Number(c.tokens)).padStart(10)} ${fmtBRL(Number(c.custo_brl)).padStart(14)} ${fmtBRL(Number(c.valor_cobrado)).padStart(12)}`
      ),
      `─────────────────────────────────────────────────────`,
      `${'TOTAL'.padEnd(20)} ${' '.padEnd(15)} ${String(totalConversas).padStart(6)} ${fmtTokens(totalTokens).padStart(10)} ${fmtBRL(totalCustoBRL).padStart(14)} ${fmtBRL(totalCobrado).padStart(12)}`,
      ``,
      `Margem total estimada: ${fmtBRL(totalMargem)}`,
      ``,
      `─────────────────────────────────────────────────────`,
      `Hubtek Solutions — app.hubteksolutions.tech`,
    ]

    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${nomeRelatorio.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
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

      const res = await fetch('/api/admin/enviar-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant?.id ?? null,
          tenant_nome: tenant?.nome ?? null,
          email_destino: emailDestino,
          mes_ref: mesParaEnviar,
          ciclos: ciclosParaEnviar,
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

  // ── Render ──
  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>

      {/* Toast */}
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

          <button
            onClick={() => { setEmailModal({ tipo: 'consolidado' }); setEmailDestino('') }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: '#10B981', color: '#fff' }}>
            <Mail size={14} /> Enviar por email
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={<FileText size={18} />} label="Ciclos fechados" value={String(ciclos.length)} accent="#6366F1" />
        <KpiCard icon={<MessageSquare size={18} />} label="Total conversas" value={totalConversas.toLocaleString('pt-BR')} accent="#818CF8" />
        <KpiCard icon={<BarChart3 size={18} />} label="Tokens consumidos" value={fmtTokens(totalTokens)} accent="#8B5CF6" />
        <KpiCard icon={<DollarSign size={18} />} label="Custo API total" value={fmtBRL(totalCustoBRL)} accent="#10A37F" />
        <KpiCard icon={<TrendingUp size={18} />} label="Margem estimada"
          value={fmtBRL(totalMargem)}
          accent={totalMargem >= 0 ? '#10B981' : '#EF4444'}
          sub={totalCobrado > 0 ? `${((totalMargem / totalCobrado) * 100).toFixed(0)}% do faturado` : undefined} />
      </div>

      {/* Tabela de ciclos */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-2"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Ciclos fechados {selectedMes !== 'todos' ? `· ${mesRefLabel(selectedMes)}` : ''}
          </h2>
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
                  <th className="text-right px-4 py-3 font-medium">Cobrado</th>
                  <th className="text-right px-4 py-3 font-medium">Margem</th>
                  <th className="text-center px-5 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ciclos.map((c, i) => {
                  const plano = PLANOS[tenants.find(t => t.id === c.tenant_id)?.plano ?? 'essencial'] ?? PLANOS.essencial
                  const margem = Number(c.valor_cobrado) - Number(c.custo_brl)
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
                      <td className="px-4 py-3 text-right" style={{ color: '#10A37F' }}>{fmtBRL(Number(c.custo_brl))}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: '#10B981' }}>{fmtBRL(Number(c.valor_cobrado))}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: margem >= 0 ? '#10B981' : '#EF4444' }}>
                        {fmtBRL(margem)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            title="Enviar relatório por email"
                            onClick={() => { setEmailModal({ ciclo: c, tipo: 'individual' }); setEmailDestino('') }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                            disabled={isEnviando}
                          >
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
                  <td className="px-4 py-3 text-right font-bold" style={{ color: '#10A37F' }}>{fmtBRL(totalCustoBRL)}</td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: '#10B981' }}>{fmtBRL(totalCobrado)}</td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: totalMargem >= 0 ? '#10B981' : '#EF4444' }}>{fmtBRL(totalMargem)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Visão por cliente (consolidado) */}
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
                  <th className="text-right px-4 py-3 font-medium">Total cobrado</th>
                  <th className="text-right px-5 py-3 font-medium">Margem total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(porTenant).map(([tid, t], i) => {
                  const plano = PLANOS[t.plano] ?? PLANOS.essencial
                  const conv = t.ciclos.reduce((s, c) => s + c.conversas, 0)
                  const custo = t.ciclos.reduce((s, c) => s + Number(c.custo_brl), 0)
                  const cobrado = t.ciclos.reduce((s, c) => s + Number(c.valor_cobrado), 0)
                  const margem = cobrado - custo
                  return (
                    <tr key={tid} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
                      <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{t.nome}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#10B98118', color: '#10B981' }}>{plano.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>{t.ciclos.length}</td>
                      <td className="px-4 py-3 text-right" style={{ color: '#818CF8' }}>{conv}</td>
                      <td className="px-4 py-3 text-right" style={{ color: '#10A37F' }}>{fmtBRL(custo)}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: '#10B981' }}>{fmtBRL(cobrado)}</td>
                      <td className="px-5 py-3 text-right font-semibold" style={{ color: margem >= 0 ? '#10B981' : '#EF4444' }}>{fmtBRL(margem)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Email */}
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
              <p>O email incluirá:</p>
              <p>· KPIs do mês (conversas, tokens, custo API, valor do plano)</p>
              {emailModal.tipo === 'consolidado' && <p>· Tabela com todos os clientes</p>}
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
