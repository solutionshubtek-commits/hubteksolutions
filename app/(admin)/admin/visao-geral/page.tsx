'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, MessageSquare, AlertTriangle, Wallet,
  Plus, ArrowUp, ArrowDown, Download, Filter,
  Search, ChevronDown, RefreshCw, Settings, X,
  CheckCircle2, AlertCircle,
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
  status: string
  agente_status: string
  expira_em: string | null
  conversasMes: number
  tokens: number
  custoUsd: number
}

interface ResumoCiclo {
  tenant_nome: string
  mes_ref: string
  conversas: number
  tokens: number
  custo_brl: string
  valor_cobrado: string
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function deltaPct(atual: number, anterior: number) {
  if (!anterior) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

function fmtBR(n: number) { return n.toLocaleString('pt-BR') }
function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}
function fmtBRL(usd: number) {
  return `R$ ${(usd * 5.8).toFixed(2).replace('.', ',')}`
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
  const header = 'Cliente,Slug,Status,Conversas,Tokens,Custo BRL,Valor a cobrar (3x),Expiração\n'
  const csv = rows.map(r => {
    const custoBRL = (r.custoUsd * 5.8).toFixed(2)
    const cobrar = (r.custoUsd * 5.8 * 3).toFixed(2)
    const exp = r.expira_em ? new Date(r.expira_em).toLocaleDateString('pt-BR') : '—'
    return `"${r.nome}","${r.slug}","${r.status}","${r.conversasMes}","${r.tokens}","${custoBRL}","${cobrar}","${exp}"`
  }).join('\n')
  const blob = new Blob([header + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `consolidado-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Badges ──────────────────────────────────────────────────────────────────

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
  if (status === 'blocked') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400">
      <AlertTriangle size={11} /> Expirado · {Math.abs(d)}d
    </span>
  )
  if (status === 'expiring') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B]">
      <AlertTriangle size={11} /> {dataFmt} · {d}d
    </span>
  )
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

// ─── Modal Fechar Ciclo ───────────────────────────────────────────────────────

function ModalFecharCiclo({
  tenant, onClose, onFechado,
}: { tenant: TenantRow; onClose: () => void; onFechado: () => void }) {
  const [fechando, setFechando] = useState(false)
  const [resumo, setResumo] = useState<ResumoCiclo | null>(null)
  const [erro, setErro] = useState('')

  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  async function handleFechar() {
    setFechando(true)
    setErro('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const res = await fetch('/api/admin/fechar-ciclo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenant.id, usuario_id: user?.id }),
    })
    const data = await res.json()
    setFechando(false)
    if (!res.ok) { setErro(data.error ?? 'Erro desconhecido'); return }
    setResumo(data.resumo)
    onFechado()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <h2 className="text-white font-semibold">Fechar ciclo — {tenant.nome}</h2>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-6">
          {resumo ? (
            <div className="space-y-4">
              <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-4 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#10B981] flex-shrink-0" />
                <p className="text-[#10B981] text-sm font-medium">Ciclo de {mesAtual} fechado com sucesso!</p>
              </div>
              <div className="bg-[#050505] border border-[#1F1F1F] rounded-xl p-4 space-y-3">
                <p className="text-white text-sm font-semibold border-b border-[#1F1F1F] pb-2">Resumo do ciclo</p>
                {[
                  ['Cliente', resumo.tenant_nome],
                  ['Mês de referência', resumo.mes_ref],
                  ['Conversas', fmtBR(resumo.conversas)],
                  ['Tokens consumidos', fmtCompact(resumo.tokens)],
                  ['Custo de API', `R$ ${resumo.custo_brl}`],
                  ['Valor a cobrar (3x)', `R$ ${resumo.valor_cobrado}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[#6B6B6B] text-xs">{label}</span>
                    <span className={`text-sm font-medium ${label === 'Valor a cobrar (3x)' ? 'text-[#10B981] font-bold' : 'text-white'}`}>{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[#6B6B6B] text-xs">O relatório foi salvo e está disponível na aba Relatórios.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[#A3A3A3] text-sm">
                Você está prestes a fechar o ciclo de <span className="text-white font-medium">{tenant.nome}</span> referente a <span className="text-white font-medium">{mesAtual}</span>.
              </p>
              <div className="bg-[#050505] border border-[#1F1F1F] rounded-xl p-4 space-y-2">
                <p className="text-white text-xs font-semibold mb-1">O que acontece ao fechar:</p>
                {[
                  'Dados do ciclo são salvos nos Relatórios',
                  'Conversas e tokens continuam visíveis no histórico',
                  'O painel volta a calcular do zero para o próximo mês',
                ].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] mt-1.5 flex-shrink-0" />
                    <p className="text-[#6B6B6B] text-xs">{item}</p>
                  </div>
                ))}
              </div>
              <div className="bg-[#050505] border border-[#1F1F1F] rounded-lg p-3">
                <p className="text-[#6B6B6B] text-xs mb-1">Resumo atual do mês</p>
                <div className="flex gap-6">
                  <div><p className="text-[#6B6B6B] text-xs">Conversas</p><p className="text-white text-sm font-medium">{fmtBR(tenant.conversasMes)}</p></div>
                  <div><p className="text-[#6B6B6B] text-xs">Tokens</p><p className="text-white text-sm font-medium">{fmtCompact(tenant.tokens)}</p></div>
                  <div><p className="text-[#6B6B6B] text-xs">Custo API</p><p className="text-white text-sm font-medium">{tenant.custoUsd > 0 ? fmtBRL(tenant.custoUsd) : '—'}</p></div>
                </div>
              </div>
              {erro && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-sm">{erro}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1F1F1F]">
          <button onClick={onClose} className="text-[#A3A3A3] hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {resumo ? 'Fechar' : 'Cancelar'}
          </button>
          {!resumo && (
            <button
              onClick={handleFechar}
              disabled={fechando}
              className="flex items-center gap-2 bg-[#F59E0B] hover:bg-[#D97706] disabled:opacity-50 text-black text-sm font-bold px-5 py-2 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={fechando ? 'animate-spin' : ''} />
              {fechando ? 'Fechando...' : 'Confirmar fechamento'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Status do sistema (sidebar footer) ──────────────────────────────────────

function StatusSistema() {
  const [status, setStatus] = useState<StatusServico>({ ok: true, mensagem: 'Verificando...', verificado_em: new Date() })

  const verificar = useCallback(async () => {
    try {
      const supabase = createClient()
      const inicio = Date.now()
      const { error } = await supabase.from('tenants').select('id', { count: 'exact', head: true })
      const latencia = Date.now() - inicio
      if (error) throw error
      setStatus({ ok: true, mensagem: `Todos os serviços operando. Latência: ${latencia}ms`, verificado_em: new Date() })
    } catch {
      setStatus({ ok: false, mensagem: 'Falha na conexão com o banco.', verificado_em: new Date() })
    }
  }, [])

  useEffect(() => {
    verificar()
    const interval = setInterval(verificar, 30000)
    return () => clearInterval(interval)
  }, [verificar])

  const segundos = Math.round((Date.now() - status.verificado_em.getTime()) / 1000)

  return (
    <div className="bg-[#050505] border border-[#1F1F1F] rounded-xl p-4">
      <p className="text-white text-xs font-semibold mb-1">Status do sistema</p>
      <p className="text-[#6B6B6B] text-xs leading-relaxed mb-2">{status.mensagem}</p>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${status.ok ? 'bg-[#10B981]' : 'bg-red-400'}`} />
        <span className={`text-xs ${status.ok ? 'text-[#10B981]' : 'text-red-400'}`}>
          {status.ok ? `status.hubtek.io · ${segundos}s atrás` : 'Serviço com falha'}
        </span>
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
  const [modalCiclo, setModalCiclo] = useState<TenantRow | null>(null)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const agora = new Date()
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
    const inicioMesAnt = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString()
    const fimMesAnt = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59).toISOString()
    const em10Dias = new Date(agora.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()

    const [tenantsRes, convMesRes, convAntRes, custoMesRes, custoAntRes, expirandoRes] = await Promise.all([
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
      conversasMes: convMesRes.count ?? 0,
      conversasAnterior: convAntRes.count ?? 0,
      custoUsdMes: custoMes,
      custoUsdAnterior: custoAnt,
      acessosExpirando: expirandoRes.count ?? 0,
    })

    const detalhe: TenantRow[] = await Promise.all(tenants.map(async (t) => {
      const [convRes, tokRes] = await Promise.all([
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).gte('criado_em', inicioMes),
        supabase.from('token_usage').select('tokens_total, custo_usd').eq('tenant_id', t.id).gte('criado_em', inicioMes),
      ])
      const tokens = (tokRes.data ?? []).reduce((s, r) => s + (r.tokens_total ?? 0), 0)
      const custoUsd = (tokRes.data ?? []).reduce((s, r) => s + (r.custo_usd ?? 0), 0)
      return {
        id: t.id, nome: t.nome, slug: t.slug,
        status: t.status,
        agente_status: t.agente_ativo === false ? 'pausado' : 'ativo',
        expira_em: t.expira_em,
        conversasMes: convRes.count ?? 0,
        tokens, custoUsd,
      }
    }))
    setRows(detalhe)
    setCarregando(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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
        <KpiCard label="Clientes ativos"      value={kpi!.clientesAtivos}                                     sub={`${kpi!.clientesBloqueados} bloqueado · ${kpi!.clientesTotal} cadastrados`} icon={Users} />
        <KpiCard label="Conversas no mês"     value={fmtCompact(kpi!.conversasMes)}                           sub="todos os clientes ativos" delta={deltaConversas}                           icon={MessageSquare} />
        <KpiCard label={`Custo de IA · ${mesAtual}`} value={kpi!.custoUsdMes > 0 ? fmtBRL(kpi!.custoUsdMes) : '—'} sub="ciclo atual" delta={deltaCusto}                                    icon={Wallet} accent={kpi!.custoUsdMes > 0} />
        <KpiCard label="Acessos a expirar"    value={kpi!.acessosExpirando}                                   sub="próximos 10 dias"                                                          icon={AlertTriangle} />
      </div>

      {/* Tabela consolidada */}
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl">
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <div>
            <h2 className="text-white font-semibold">Clientes — visão consolidada</h2>
            <p className="text-[#6B6B6B] text-xs mt-0.5">Status do agente, consumo e custo por cliente. Feche ciclos próximos do vencimento à direita.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
                className="appearance-none bg-[#050505] border border-[#1F1F1F] text-white text-xs font-medium pl-3 pr-8 py-2 rounded-lg cursor-pointer hover:border-[#2A2A2A] focus:outline-none focus:border-[#10B981]">
                <option value="todos">Todos os planos</option>
                <option value="ativo">Apenas ativos</option>
                <option value="expirando">Expirando</option>
                <option value="bloqueado">Bloqueados</option>
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B] pointer-events-none" />
            </div>
            <button className="flex items-center gap-1.5 bg-[#050505] border border-[#1F1F1F] text-[#A3A3A3] hover:text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
              <Filter size={12} /> Filtrar
            </button>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
              <input type="text" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)}
                className="bg-[#050505] border border-[#1F1F1F] text-white text-xs placeholder-[#6B6B6B] rounded-lg pl-8 pr-3 py-2 w-32 focus:outline-none focus:border-[#10B981]" />
            </div>
          </div>
        </div>

        {rowsFiltradas.length === 0 ? (
          <div className="p-12 text-center"><p className="text-[#6B6B6B] text-sm">Nenhum cliente encontrado.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1F1F1F]">
                  {['Cliente', 'Status do agente', 'Expiração do acesso', 'Conversas', 'Tokens', 'Custo estimado', 'Ações'].map(h => (
                    <th key={h} className={`text-[#6B6B6B] text-xs font-semibold px-6 py-3 uppercase tracking-wider ${['Conversas', 'Tokens', 'Custo estimado'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.map(r => {
                  const exp = expiryStatus(r.expira_em)
                  return (
                    <tr key={r.id} className="border-b border-[#1F1F1F] last:border-0 hover:bg-[#141414] transition-colors">
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
                      <td className="px-6 py-4"><AgentBadge status={r.agente_status} /></td>
                      <td className="px-6 py-4"><ExpiryTag expira_em={r.expira_em} /></td>
                      <td className="px-6 py-4 text-right"><span className="text-white text-sm font-mono font-medium">{fmtBR(r.conversasMes)}</span></td>
                      <td className="px-6 py-4 text-right"><span className="text-[#A3A3A3] text-sm font-mono">{r.tokens > 0 ? fmtCompact(r.tokens) : '—'}</span></td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-mono font-semibold ${r.custoUsd > 0 ? 'text-[#10B981]' : 'text-[#3A3A3A]'}`}>
                          {r.custoUsd > 0 ? fmtBRL(r.custoUsd) : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <a href="/admin/clientes" className="flex items-center gap-1 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#A3A3A3] hover:text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors">
                            Detalhes
                          </a>
                          <button className="flex items-center bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#6B6B6B] hover:text-white text-xs font-medium p-1.5 rounded-md transition-colors">
                            <Settings size={12} />
                          </button>
                          {(exp === 'expiring' || exp === 'blocked' || r.conversasMes > 0) && (
                            <button
                              onClick={() => setModalCiclo(r)}
                              className="flex items-center gap-1 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                            >
                              <AlertTriangle size={11} /> Fechar ciclo
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

      {/* Modal fechar ciclo */}
      {modalCiclo && (
        <ModalFecharCiclo
          tenant={modalCiclo}
          onClose={() => setModalCiclo(null)}
          onFechado={fetchData}
        />
      )}
    </div>
  )
}
