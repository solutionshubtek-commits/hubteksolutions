'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp,
  TrendingDown,
  Zap,
  DollarSign,
  BarChart3,
  ChevronDown,
  RefreshCw,
  Bot,
  Brain,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AiUsageRow {
  tenant_id: string
  ciclo_mes: number
  ciclo_ano: number
  tokens_entrada: number
  tokens_saida: number
  custo_estimado_reais: number
  motor_utilizado: string
  tenants: { nome: string } | null
}

interface TenantOption {
  id: string
  nome: string
}

interface MesData {
  label: string        // "Jan/25"
  openai: number
  anthropic: number
  total: number
}

interface ClienteRow {
  tenantId: string
  nome: string
  openai_tokens: number
  anthropic_tokens: number
  openai_custo: number
  anthropic_custo: number
  total_custo: number
  total_tokens: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function mesLabel(mes: number, ano: number) {
  return `${MESES[mes - 1]}/${String(ano).slice(2)}`
}

function fmtBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function fmtTokens(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`
  return String(val)
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CustosIAPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>('todos')
  const [selectedAno, setSelectedAno] = useState<number>(new Date().getFullYear())
  const [rawData, setRawData] = useState<AiUsageRow[]>([])

  // Anos disponíveis
  const anosDisponiveis = Array.from(
    new Set(rawData.map(r => r.ciclo_ano))
  ).sort((a, b) => b - a)

  if (anosDisponiveis.length === 0) anosDisponiveis.push(new Date().getFullYear())

  // ── Busca dados ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Tenants
      const { data: tData } = await supabase
        .from('tenants')
        .select('id, nome')
        .order('nome')
      setTenants((tData ?? []) as TenantOption[])

      // ai_usage com join de tenants
      let query = supabase
        .from('ai_usage')
        .select('tenant_id, ciclo_mes, ciclo_ano, tokens_entrada, tokens_saida, custo_estimado_reais, motor_utilizado, tenants(nome)')
        .eq('ciclo_ano', selectedAno)

      if (selectedTenant !== 'todos') {
        query = query.eq('tenant_id', selectedTenant)
      }

      const { data: usage } = await query
      setRawData((usage ?? []) as AiUsageRow[])
    } finally {
      setLoading(false)
    }
  }, [selectedTenant, selectedAno])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Dados derivados ──

  // KPIs totais
  const totalCusto = rawData.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalTokens = rawData.reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0)
  const totalOpenAI = rawData.filter(r => r.motor_utilizado === 'openai').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalAnthropic = rawData.filter(r => r.motor_utilizado === 'anthropic').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)

  // Série mensal (12 meses do ano selecionado)
  const seriesMensal: MesData[] = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1
    const rows = rawData.filter(r => r.ciclo_mes === mes)
    const openai = rows.filter(r => r.motor_utilizado === 'openai').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
    const anthropic = rows.filter(r => r.motor_utilizado === 'anthropic').reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
    return { label: mesLabel(mes, selectedAno), openai, anthropic, total: openai + anthropic }
  })

  const maxBar = Math.max(...seriesMensal.map(m => m.total), 0.01)

  // Tabela por cliente (apenas no modo "todos")
  const clienteMap: Record<string, ClienteRow> = {}
  if (selectedTenant === 'todos') {
    rawData.forEach(r => {
      const nome = r.tenants?.nome ?? r.tenant_id
      if (!clienteMap[r.tenant_id]) {
        clienteMap[r.tenant_id] = {
          tenantId: r.tenant_id, nome,
          openai_tokens: 0, anthropic_tokens: 0,
          openai_custo: 0, anthropic_custo: 0,
          total_custo: 0, total_tokens: 0,
        }
      }
      const t = clienteMap[r.tenant_id]
      const tok = r.tokens_entrada + r.tokens_saida
      const custo = Number(r.custo_estimado_reais)
      t.total_tokens += tok
      t.total_custo += custo
      if (r.motor_utilizado === 'openai') { t.openai_tokens += tok; t.openai_custo += custo }
      else { t.anthropic_tokens += tok; t.anthropic_custo += custo }
    })
  }
  const clientes = Object.values(clienteMap).sort((a, b) => b.total_custo - a.total_custo)

  // Mês corrente vs anterior
  const mesAtual = new Date().getMonth() + 1
  const custoMesAtual = seriesMensal[mesAtual - 1]?.total ?? 0
  const custoMesAnterior = mesAtual > 1 ? (seriesMensal[mesAtual - 2]?.total ?? 0) : 0
  const varPct = custoMesAnterior > 0
    ? ((custoMesAtual - custoMesAnterior) / custoMesAnterior) * 100
    : null

  // ── Render ──
  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Custos de IA
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Consumo de tokens e custos estimados por motor de IA
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro Ano */}
          <div className="relative">
            <select
              value={selectedAno}
              onChange={e => setSelectedAno(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium focus:outline-none"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {anosDisponiveis.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
          </div>

          {/* Filtro Cliente */}
          <div className="relative">
            <select
              value={selectedTenant}
              onChange={e => setSelectedTenant(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium focus:outline-none"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="todos">Todos os clientes</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
          </div>

          <button
            onClick={fetchData}
            className="p-2 rounded-lg transition-colors"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <RefreshCw size={16} style={{ color: 'var(--text-secondary)' }} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<DollarSign size={18} />}
          label="Custo Total no Ano"
          value={fmtBRL(totalCusto)}
          accent="#10B981"
        />
        <KpiCard
          icon={<BarChart3 size={18} />}
          label="Tokens Consumidos"
          value={fmtTokens(totalTokens)}
          accent="#6366F1"
        />
        <KpiCard
          icon={<Bot size={18} />}
          label="Custo OpenAI"
          value={fmtBRL(totalOpenAI)}
          accent="#10A37F"
          sub={totalCusto > 0 ? `${((totalOpenAI / totalCusto) * 100).toFixed(0)}% do total` : '—'}
        />
        <KpiCard
          icon={<Brain size={18} />}
          label="Custo Anthropic"
          value={fmtBRL(totalAnthropic)}
          accent="#D97757"
          sub={totalCusto > 0 ? `${((totalAnthropic / totalCusto) * 100).toFixed(0)}% do total` : '—'}
        />
      </div>

      {/* Gráfico de barras mensal */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Custo mensal — {selectedAno}
          </h2>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#10A37F' }} />
              OpenAI
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#D97757' }} />
              Anthropic
            </span>
            {varPct !== null && (
              <span
                className="flex items-center gap-1 font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: varPct >= 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                  color: varPct >= 0 ? '#EF4444' : '#10B981',
                }}
              >
                {varPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {Math.abs(varPct).toFixed(1)}% vs mês ant.
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
          </div>
        ) : (
          <div className="flex items-end gap-1.5 h-40">
            {seriesMensal.map((m, i) => {
              const pctTotal = (m.total / maxBar) * 100
              const pctOpenAI = m.total > 0 ? (m.openai / m.total) * 100 : 0
              const pctAnthropic = 100 - pctOpenAI
              const isCurrent = i + 1 === mesAtual && selectedAno === new Date().getFullYear()

              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {/* Tooltip */}
                  <div
                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
                    style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                  >
                    <div className="font-semibold mb-0.5">{m.label}</div>
                    <div className="text-green-400">OpenAI: {fmtBRL(m.openai)}</div>
                    <div className="text-orange-400">Anthropic: {fmtBRL(m.anthropic)}</div>
                    <div className="text-white font-semibold border-t border-gray-700 mt-1 pt-1">Total: {fmtBRL(m.total)}</div>
                  </div>

                  {/* Barra empilhada */}
                  <div
                    className="w-full rounded-t-md overflow-hidden transition-all duration-300"
                    style={{
                      height: `${Math.max(pctTotal, m.total > 0 ? 4 : 0)}%`,
                      minHeight: m.total > 0 ? '4px' : '2px',
                      background: 'var(--border)',
                    }}
                  >
                    {m.total > 0 && (
                      <div className="w-full h-full flex flex-col-reverse">
                        <div style={{ height: `${pctOpenAI}%`, background: '#10A37F', minHeight: m.openai > 0 ? '2px' : '0' }} />
                        <div style={{ height: `${pctAnthropic}%`, background: '#D97757', minHeight: m.anthropic > 0 ? '2px' : '0' }} />
                      </div>
                    )}
                  </div>

                  <span
                    className="text-[10px] font-medium"
                    style={{ color: isCurrent ? '#10B981' : 'var(--text-secondary)' }}
                  >
                    {m.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tabela por cliente (só quando "todos") */}
      {selectedTenant === 'todos' && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
        >
          <div className="px-5 py-4" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Consumo por cliente — {selectedAno}
            </h2>
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
                    <th className="text-right px-4 py-3 font-medium">
                      <span className="flex items-center justify-end gap-1.5">
                        <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#10A37F' }} />
                        OpenAI
                      </span>
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      <span className="flex items-center justify-end gap-1.5">
                        <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#D97757' }} />
                        Anthropic
                      </span>
                    </th>
                    <th className="text-right px-4 py-3 font-medium">Tokens</th>
                    <th className="text-right px-5 py-3 font-medium">Total (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, i) => {
                    const pctOpenAI = c.total_tokens > 0 ? (c.openai_tokens / c.total_tokens) * 100 : 0
                    const pctAnthropic = 100 - pctOpenAI
                    return (
                      <tr
                        key={c.tenantId}
                        className="transition-colors"
                        style={{
                          background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)',
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                          {c.nome}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: '#10A37F' }}>
                          {fmtBRL(c.openai_custo)}
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {fmtTokens(c.openai_tokens)} tok
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: '#D97757' }}>
                          {fmtBRL(c.anthropic_custo)}
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {fmtTokens(c.anthropic_tokens)} tok
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Mini barra de proporção */}
                            <div className="w-16 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--border)' }}>
                              <div style={{ width: `${pctOpenAI}%`, background: '#10A37F' }} />
                              <div style={{ width: `${pctAnthropic}%`, background: '#D97757' }} />
                            </div>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {fmtTokens(c.total_tokens)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {fmtBRL(c.total_custo)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)', color: 'var(--text-primary)' }}>
                    <td className="px-5 py-3 font-bold">Total</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#10A37F' }}>{fmtBRL(totalOpenAI)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#D97757' }}>{fmtBRL(totalAnthropic)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtTokens(totalTokens)}</td>
                    <td className="px-5 py-3 text-right font-bold">{fmtBRL(totalCusto)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detalhe por motor quando cliente específico selecionado */}
      {selectedTenant !== 'todos' && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MotorCard
            nome="OpenAI"
            cor="#10A37F"
            icon={<Bot size={16} />}
            rows={rawData.filter(r => r.motor_utilizado === 'openai')}
          />
          <MotorCard
            nome="Anthropic"
            cor="#D97757"
            icon={<Brain size={16} />}
            rows={rawData.filter(r => r.motor_utilizado === 'anthropic')}
          />
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, accent, sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
  sub?: string
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}18`, color: accent }}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
      </div>
    </div>
  )
}

function MotorCard({
  nome, cor, icon, rows,
}: {
  nome: string
  cor: string
  icon: React.ReactNode
  rows: AiUsageRow[]
}) {
  const totalCusto = rows.reduce((s, r) => s + Number(r.custo_estimado_reais), 0)
  const totalTokens = rows.reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0)
  const totalEntrada = rows.reduce((s, r) => s + r.tokens_entrada, 0)
  const totalSaida = rows.reduce((s, r) => s + r.tokens_saida, 0)
  const usos = rows.length

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: `1px solid ${cor}30` }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cor}18`, color: cor }}>
          {icon}
        </div>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{nome}</span>
        {rows.length === 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            Sem uso
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Custo estimado" value={fmtBRL(totalCusto)} cor={cor} />
        <Stat label="Total de tokens" value={fmtTokens(totalTokens)} cor={cor} />
        <Stat label="Tokens entrada" value={fmtTokens(totalEntrada)} cor="var(--text-secondary)" small />
        <Stat label="Tokens saída" value={fmtTokens(totalSaida)} cor="var(--text-secondary)" small />
        <Stat label="Requisições" value={String(usos)} cor="var(--text-secondary)" small />
      </div>
    </div>
  )
}

function Stat({ label, value, cor, small }: { label: string; value: string; cor: string; small?: boolean }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className={small ? 'text-sm font-medium mt-0.5' : 'text-base font-bold mt-0.5'} style={{ color: cor }}>
        {value}
      </p>
    </div>
  )
}
