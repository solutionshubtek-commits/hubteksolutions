'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, MessageSquare, AlertTriangle, Wallet,
  Plus, ArrowUp, ArrowDown, Download, Filter,
  Search, ChevronDown, RefreshCw, Settings,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KpiData {
  clientesAtivos: number
  clientesTotal: number
  clientesBloqueados: number
  conversasMes: number
  conversasAnterior: number
  custoUsdMes: number
  custoUsdAnterior: number
  acessosExpirando: number
}

interface TenantRow {
  id: string
  nome: string
  slug: string
  segmento: string
  status: string
  agente_status: string
  expira_em: string | null
  conversasMes: number
  tokens: number
  custoUsd: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deltaPct(atual: number, anterior: number) {
  if (!anterior) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

function fmtBR(n: number) {
  return n.toLocaleString('pt-BR')
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function fmtBRL(usd: number) {
  const reais = usd * 5.8
  return `R$ ${reais.toFixed(2).replace('.', ',')}`
}

function diasAteExpirar(expira_em: string | null) {
  if (!expira_em) return null
  return Math.ceil((new Date(expira_em).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function expiryStatus(expira_em: string | null) {
  const d = diasAteExpirar(expira_em)
  if (d === null) return 'none'
  if (d < 0) return 'blocked'
  if (d <= 10) return 'expiring'
  return 'ok'
}

function exportarConsolidado(rows: TenantRow[]) {
  const header = 'Cliente,Slug,Segmento,Status,Conversas,Tokens,Custo USD,Custo BRL,Valor a cobrar (3x),Expiração\n'
  const csv = rows.map(r => {
    const custoBRL = (r.custoUsd * 5.8).toFixed(2)
    const cobrar = (r.custoUsd * 5.8 * 3).toFixed(2)
    const exp = r.expira_em ? new Date(r.expira_em).toLocaleDateString('pt-BR') : '—'
    return `"${r.nome}","${r.slug}","${r.segmento}","${r.status}","${r.conversasMes}","${r.tokens}","${r.custoUsd.toFixed(4)}","${custoBRL}","${cobrar}","${exp}"`
  }).join('\n')
  const blob = new Blob([header + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `consolidado-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Status badges ────────────────────────────────────────────────────────────

function AgentBadge({ status }: { status: string }) {
  const cfg = {
    ativo:        { cor: '#10B981', bg: '#10B98118', border: '#10B98140', label: 'Ativo' },
    pausado:      { cor: '#F59E0B', bg: '#F59E0B18', border: '#F59E0B40', label: 'Pausado' },
    desconectado: { cor: '#EF4444', bg: '#EF444418', border: '#EF444440', label: 'Desconectado' },
  }[status] ?? { cor: '#6B6B6B', bg: '#6B6B6B18', border: '#6B6B6B40', label: 'Inativo' }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border" style={{ color: cfg.cor, background: cfg.bg, borderColor: cfg.border }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.cor }} />
      {cfg.label}
    </span>
  )
}

function ExpiryTag({ expira_em }: { expira_em: string | null }) {
  if (!expira_em) return <span className="text-[#3A3A3A] text-xs">—</span>

  const d = diasAteExpirar(expira_em)!
  const status = expiryStatus(expira_em)
  const dataFmt = new Date(expira_em).toLocaleDateString('pt-BR')

  if (status === 'blocked') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400">
        <AlertTriangle size={11} /> Expirado · {Math.abs(d)}d
      </span>
    )
  }
  if (status === 'expiring') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B]">
        <AlertTriangle size={11} /> {dataFmt} · {d}d
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-[#050505] border border-[#1F1F1F] text-[#A3A3A3]">
      {dataFmt}
    </span>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, delta, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string; delta?: number | null
  icon: React.ElementType; accent?: boolean
}) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#A3A3A3] text-sm">{label}</p>
        <div className="w-9 h-9 rounded-lg bg-[#10B981]/10 flex items-center justify-center">
          <Icon size={16} className="text-[#10B981]" />
        </div>
      </div>
      <p className={`text-3xl font-bold mb-2 ${accent ? 'text-[#10B981]' : 'text-white'}`}>{value}</p>
      <div className="flex items-center justify-between">
        {sub && <span className="text-[#6B6B6B] text-xs">{sub}</span>}
        {delta != null && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${delta >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
            {delta >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {delta >= 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function AdminVisaoGeralPage() {
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [rows, setRows] = useState<TenantRow[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'expirando' | 'bloqueado'>('todos')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const agora = new Date()
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
      const inicioMesAnt = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString()
      const fimMesAnt = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59).toISOString()
      const em10Dias = new Date(agora.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()

      const [tenantsRes, conversasMesRes, conversasAntRes, custoMesRes, custoAntRes, expirandoRes] = await Promise.all([
        supabase.from('tenants').select('id, nome, slug, status, expira_em, agente_ativo'),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('criado_em', inicioMes),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('criado_em', inicioMesAnt).lte('criado_em', fimMesAnt),
        supabase.from('token_usage').select('custo_usd').gte('criado_em', inicioMes),
        supabase.from('token_usage').select('custo_usd').gte('criado_em', inicioMesAnt).lte('criado_em', fimMesAnt),
        supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'ativo').lte('expira_em', em10Dias).gte('expira_em', agora.toISOString()),
      ])

      const tenants = tenantsRes.data ?? []
      const ativos = tenants.filter(t => t.status === 'ativo').length
      const bloqueados = tenants.filter(t => t.status === 'bloqueado').length
      const custoMes = (custoMesRes.data ?? []).reduce((s, r) => s + (r.custo_usd ?? 0), 0)
      const custoAnt = (custoAntRes.data ?? []).reduce((s, r) => s + (r.custo_usd ?? 0), 0)

      setKpi({
        clientesAtivos: ativos,
        clientesTotal: tenants.length,
        clientesBloqueados: bloqueados,
        conversasMes: conversasMesRes.count ?? 0,
        conversasAnterior: conversasAntRes.count ?? 0,
        custoUsdMes: custoMes,
        custoUsdAnterior: custoAnt,
        acessosExpirando: expirandoRes.count ?? 0,
      })

      // Detalhe por tenant
      const detalhe: TenantRow[] = await Promise.all(tenants.map(async (t) => {
        const [convRes, tokensRes] = await Promise.all([
          supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).gte('criado_em', inicioMes),
          supabase.from('token_usage').select('tokens_total, custo_usd').eq('tenant_id', t.id).gte('criado_em', inicioMes),
        ])
        const tokens = (tokensRes.data ?? []).reduce((s, r) => s + (r.tokens_total ?? 0), 0)
        const custoUsd = (tokensRes.data ?? []).reduce((s, r) => s + (r.custo_usd ?? 0), 0)
        return {
          id: t.id, nome: t.nome, slug: t.slug, segmento: '—',
          status: t.status,
          agente_status: t.agente_ativo === false ? 'pausado' : 'ativo',
          expira_em: t.expira_em,
          conversasMes: convRes.count ?? 0,
          tokens, custoUsd,
        }
      }))
      setRows(detalhe)
      setCarregando(false)
    }
    fetchData()
  }, [])

  const rowsFiltradas = rows.filter(r => {
    const matchBusca = r.nome.toLowerCase().includes(busca.toLowerCase()) || r.slug.toLowerCase().includes(busca.toLowerCase())
    if (!matchBusca) return false
    if (filtroStatus === 'todos') return true
    if (filtroStatus === 'ativo') return r.status === 'ativo'
    if (filtroStatus === 'bloqueado') return r.status === 'bloqueado'
    if (filtroStatus === 'expirando') return expiryStatus(r.expira_em) === 'expiring'
    return true
  })

  if (carregando) {
    return (
      <div className="p-8 space-y-6">
        <div>
          <p className="text-[#6B6B6B] text-sm mb-1">Painel Administrativo</p>
          <h1 className="text-white text-2xl font-bold">Visão Geral Consolidada</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl animate-pulse" />)}
        </div>
        <div className="h-96 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl animate-pulse" />
      </div>
    )
  }

  const deltaConversas = deltaPct(kpi!.conversasMes, kpi!.conversasAnterior)
  const deltaCusto = deltaPct(kpi!.custoUsdMes, kpi!.custoUsdAnterior)

  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="p-8 space-y-6">

      {/* Page head */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[#6B6B6B] text-sm mb-1">Painel Administrativo</p>
          <h1 className="text-white text-2xl font-bold">Visão Geral Consolidada</h1>
          <p className="text-[#A3A3A3] text-sm mt-1">
            Saúde da operação, custos e performance dos {kpi!.clientesAtivos} clientes ativos no ciclo atual.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarConsolidado(rows)}
            className="flex items-center gap-2 bg-[#0A0A0A] hover:bg-[#141414] border border-[#1F1F1F] text-[#A3A3A3] hover:text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <Download size={14} /> Exportar consolidado
          </button>
          <a href="/admin/clientes" className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
            <Plus size={14} /> Novo cliente
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Clientes ativos"
          value={kpi!.clientesAtivos}
          sub={`${kpi!.clientesBloqueados} bloqueado · ${kpi!.clientesTotal} cadastrados`}
          icon={Users}
        />
        <KpiCard
          label="Conversas no mês"
          value={fmtCompact(kpi!.conversasMes)}
          sub="todos os clientes ativos"
          delta={deltaConversas}
          icon={MessageSquare}
        />
        <KpiCard
          label={`Custo de IA · ${mesAtual}`}
          value={kpi!.custoUsdMes > 0 ? fmtBRL(kpi!.custoUsdMes) : '—'}
          sub="ciclo atual"
          delta={deltaCusto}
          icon={Wallet}
          accent={kpi!.custoUsdMes > 0}
        />
        <KpiCard
          label="Acessos a expirar"
          value={kpi!.acessosExpirando}
          sub="próximos 10 dias"
          icon={AlertTriangle}
        />
      </div>

      {/* Tabela consolidada */}
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl">
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <div>
            <h2 className="text-white font-semibold">Clientes — visão consolidada</h2>
            <p className="text-[#6B6B6B] text-xs mt-0.5">
              Status do agente, consumo e custo por cliente. Renove acessos próximos do vencimento à direita.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filtro status */}
            <div className="relative">
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
                className="appearance-none bg-[#050505] border border-[#1F1F1F] text-white text-xs font-medium pl-3 pr-8 py-2 rounded-lg cursor-pointer hover:border-[#2A2A2A] focus:outline-none focus:border-[#10B981]"
              >
                <option value="todos">Todos os status</option>
                <option value="ativo">Apenas ativos</option>
                <option value="expirando">Expirando</option>
                <option value="bloqueado">Bloqueados</option>
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B] pointer-events-none" />
            </div>

            {/* Busca */}
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
              <input
                type="text"
                placeholder="Buscar..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="bg-[#050505] border border-[#1F1F1F] text-white text-xs placeholder-[#6B6B6B] rounded-lg pl-8 pr-3 py-2 w-40 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            <button className="flex items-center gap-1.5 bg-[#050505] hover:bg-[#141414] border border-[#1F1F1F] text-[#A3A3A3] hover:text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
              <Filter size={12} /> Filtrar
            </button>
          </div>
        </div>

        {rowsFiltradas.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[#6B6B6B] text-sm">Nenhum cliente encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1F1F1F]">
                  <th className="text-left text-[#6B6B6B] text-xs font-semibold px-6 py-3 uppercase tracking-wider">Cliente</th>
                  <th className="text-left text-[#6B6B6B] text-xs font-semibold px-6 py-3 uppercase tracking-wider">Status do agente</th>
                  <th className="text-left text-[#6B6B6B] text-xs font-semibold px-6 py-3 uppercase tracking-wider">Expiração do acesso</th>
                  <th className="text-right text-[#6B6B6B] text-xs font-semibold px-6 py-3 uppercase tracking-wider">Conversas</th>
                  <th className="text-right text-[#6B6B6B] text-xs font-semibold px-6 py-3 uppercase tracking-wider">Tokens</th>
                  <th className="text-right text-[#6B6B6B] text-xs font-semibold px-6 py-3 uppercase tracking-wider">Custo estimado</th>
                  <th className="text-left text-[#6B6B6B] text-xs font-semibold px-6 py-3 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.map(r => {
                  const exp = expiryStatus(r.expira_em)
                  return (
                    <tr key={r.id} className="border-b border-[#1F1F1F] last:border-0 hover:bg-[#141414] transition-colors">
                      {/* Cliente */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-[#1F1F1F] flex items-center justify-center text-[#A3A3A3] text-xs font-semibold flex-shrink-0">
                            {r.nome.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{r.nome}</p>
                            <p className="text-[#6B6B6B] text-xs font-mono">{r.slug}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status agente */}
                      <td className="px-6 py-4">
                        <AgentBadge status={r.agente_status} />
                      </td>

                      {/* Expiração */}
                      <td className="px-6 py-4">
                        <ExpiryTag expira_em={r.expira_em} />
                      </td>

                      {/* Conversas */}
                      <td className="px-6 py-4 text-right">
                        <span className="text-white text-sm font-mono font-medium">{fmtBR(r.conversasMes)}</span>
                      </td>

                      {/* Tokens */}
                      <td className="px-6 py-4 text-right">
                        <span className="text-[#A3A3A3] text-sm font-mono">{r.tokens > 0 ? fmtCompact(r.tokens) : '—'}</span>
                      </td>

                      {/* Custo */}
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-mono font-semibold ${r.custoUsd > 0 ? 'text-[#10B981]' : 'text-[#3A3A3A]'}`}>
                          {r.custoUsd > 0 ? fmtBRL(r.custoUsd) : '—'}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <a
                            href="/admin/clientes"
                            className="flex items-center gap-1 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#A3A3A3] hover:text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                          >
                            Detalhes
                          </a>
                          {exp === 'blocked' ? (
                            <button className="flex items-center gap-1 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30 text-xs font-medium px-3 py-1.5 rounded-md transition-colors">
                              <RefreshCw size={11} /> Renovar
                            </button>
                          ) : exp === 'expiring' ? (
                            <button className="flex items-center gap-1 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30 text-xs font-medium px-3 py-1.5 rounded-md transition-colors">
                              <AlertTriangle size={11} /> Renovar
                            </button>
                          ) : (
                            <button className="flex items-center bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#6B6B6B] hover:text-white text-xs font-medium p-1.5 rounded-md transition-colors">
                              <Settings size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
