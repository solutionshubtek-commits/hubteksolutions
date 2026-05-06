'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, MessageSquare, AlertTriangle, Wallet,
  Plus, ArrowUp, ArrowDown, Download, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KpiData {
  clientesAtivos: number
  clientesTotal: number
  clientesBloqueados: number
  conversasMes: number
  conversasAnterior: number
  acessosExpirando: number
  tenantsExpirando: { nome: string; slug: string; expira_em: string }[]
}

interface TenantConsolidado {
  id: string
  nome: string
  slug: string
  status: string
  expira_em: string | null
  conversasMes: number
  custoUsd: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deltaPct(atual: number, anterior: number) {
  if (!anterior) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

function statusConfig(status: string) {
  const map: Record<string, { label: string; cor: string; bg: string; border: string }> = {
    ativo:     { label: 'Ativo',     cor: '#10B981', bg: '#10B98118', border: '#10B98140' },
    inativo:   { label: 'Inativo',   cor: '#6B6B6B', bg: '#6B6B6B18', border: '#6B6B6B40' },
    bloqueado: { label: 'Bloqueado', cor: '#EF4444', bg: '#EF444418', border: '#EF444440' },
  }
  return map[status] ?? map['inativo']
}

function exportarConsolidado(tenants: TenantConsolidado[]) {
  const header = 'Cliente,Slug,Status,Conversas no mês,Custo API (R$),Valor a cobrar (R$),Expiração\n'
  const rows = tenants.map(t => {
    const custoReais = (t.custoUsd * 5.8).toFixed(2)
    const valorCobrar = (t.custoUsd * 5.8 * 3).toFixed(2)
    const expira = t.expira_em ? new Date(t.expira_em).toLocaleDateString('pt-BR') : '—'
    return `"${t.nome}","${t.slug}","${t.status}","${t.conversasMes}","${custoReais}","${valorCobrar}","${expira}"`
  }).join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'consolidado-clientes.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, delta, icon: Icon, accent, cor }: {
  label: string; value: string | number; sub?: string; delta?: number | null
  icon: React.ElementType; accent?: boolean; cor?: string
}) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#A3A3A3] text-sm">{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cor ?? '#6B6B6B'}18` }}>
          <Icon size={16} color={cor ?? '#6B6B6B'} />
        </div>
      </div>
      <p className={`text-3xl font-bold mb-2 ${accent ? 'text-[#10B981]' : 'text-white'}`}>{value}</p>
      <div className="flex items-center justify-between">
        {sub && <span className="text-[#6B6B6B] text-xs">{sub}</span>}
        {delta != null && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${delta >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
            {delta >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Bot icon ─────────────────────────────────────────────────────────────────

function Bot({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2"/>
      <path d="M12 4v4M8 14h.01M16 14h.01M9 18h6"/>
    </svg>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function AdminVisaoGeralPage() {
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [consolidado, setConsolidado] = useState<TenantConsolidado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoConsolidado, setCarregandoConsolidado] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const agora = new Date()
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
      const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString()
      const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59).toISOString()
      const em10Dias = new Date(agora.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()

      const [tenantsRes, conversasMesRes, conversasAntRes, expirando] = await Promise.all([
        supabase.from('tenants').select('id, nome, slug, status, expira_em'),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('criado_em', inicioMes),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('criado_em', inicioMesAnterior).lte('criado_em', fimMesAnterior),
        supabase.from('tenants').select('nome, slug, expira_em').eq('status', 'ativo').lte('expira_em', em10Dias).gte('expira_em', agora.toISOString()),
      ])

      const tenants = tenantsRes.data ?? []
      const ativos = tenants.filter(t => t.status === 'ativo').length
      const bloqueados = tenants.filter(t => t.status === 'bloqueado' || t.status === 'inativo').length

      setKpi({
        clientesAtivos: ativos,
        clientesTotal: tenants.length,
        clientesBloqueados: bloqueados,
        conversasMes: conversasMesRes.count ?? 0,
        conversasAnterior: conversasAntRes.count ?? 0,
        acessosExpirando: expirando.data?.length ?? 0,
        tenantsExpirando: expirando.data ?? [],
      })
      setCarregando(false)

      // Busca consolidado por tenant
      const consolidadoData: TenantConsolidado[] = await Promise.all(
        tenants.map(async (t) => {
          const [convRes, custoRes] = await Promise.all([
            supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).gte('criado_em', inicioMes),
            supabase.from('token_usage').select('custo_usd').eq('tenant_id', t.id).gte('criado_em', inicioMes),
          ])
          const custoUsd = (custoRes.data ?? []).reduce((s, r) => s + (r.custo_usd ?? 0), 0)
          return {
            id: t.id,
            nome: t.nome,
            slug: t.slug,
            status: t.status,
            expira_em: t.expira_em,
            conversasMes: convRes.count ?? 0,
            custoUsd,
          }
        })
      )
      setConsolidado(consolidadoData)
      setCarregandoConsolidado(false)
    }
    fetchData()
  }, [])

  if (carregando) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <p className="text-[#6B6B6B] text-sm mb-1">Painel Administrativo</p>
          <h1 className="text-white text-2xl font-bold">Visão Geral Consolidada</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-5 animate-pulse">
              <div className="h-3 bg-[#1F1F1F] rounded mb-4 w-3/4" />
              <div className="h-8 bg-[#1F1F1F] rounded w-1/2 mb-2" />
              <div className="h-2 bg-[#1F1F1F] rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const deltaConversas = deltaPct(kpi!.conversasMes, kpi!.conversasAnterior)
  const custoTotalUsd = consolidado.reduce((s, t) => s + t.custoUsd, 0)
  const custoTotalReais = custoTotalUsd * 5.8
  const valorTotalCobrar = custoTotalReais * 3

  return (
    <div className="p-8 space-y-8">

      {/* Page head */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[#6B6B6B] text-sm mb-1">Painel Administrativo</p>
          <h1 className="text-white text-2xl font-bold">Visão Geral Consolidada</h1>
          <p className="text-[#A3A3A3] text-sm mt-1">Saúde da operação e performance de todos os clientes ativos.</p>
        </div>
        <Link href="/admin/clientes" className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={15} /> Novo cliente
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Clientes ativos"    value={kpi!.clientesAtivos}                       sub={`${kpi!.clientesBloqueados} bloqueado · ${kpi!.clientesTotal} total`} icon={Users}          cor="#3B82F6" />
        <KpiCard label="Conversas no mês"   value={kpi!.conversasMes.toLocaleString('pt-BR')} sub="todos os clientes ativos" delta={deltaConversas}                       icon={MessageSquare}  cor="#10B981" />
        <KpiCard label="Custo total de IA"  value={custoTotalReais > 0 ? `R$ ${custoTotalReais.toFixed(2)}` : '—'} sub="este mês · todos os clientes"                    icon={Wallet}         cor="#8B5CF6" accent={custoTotalReais === 0} />
        <KpiCard label="Acessos a expirar"  value={kpi!.acessosExpirando}                     sub="próximos 10 dias"                                                      icon={AlertTriangle}  cor="#F59E0B" />
      </div>

      {/* Alertas de expiração */}
      {kpi!.tenantsExpirando.length > 0 && (
        <div className="bg-[#0A0A0A] border border-[#F59E0B]/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-[#F59E0B]" />
            <h2 className="text-white text-sm font-semibold">Acessos próximos do vencimento</h2>
          </div>
          <div className="space-y-2">
            {kpi!.tenantsExpirando.map(t => (
              <div key={t.slug} className="flex items-center justify-between bg-[#050505] border border-[#1F1F1F] rounded-lg px-4 py-2.5">
                <span className="text-white text-sm font-medium">{t.nome}</span>
                <span className="text-[#F59E0B] text-xs font-medium bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-2.5 py-1 rounded-full">
                  Expira em {new Date(t.expira_em).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela consolidada */}
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <div>
            <h2 className="text-white font-semibold">Clientes — visão consolidada</h2>
            <p className="text-[#6B6B6B] text-xs mt-0.5">Resumo de uso e custos por cliente no mês atual.</p>
          </div>
          <button
            onClick={() => exportarConsolidado(consolidado)}
            className="flex items-center gap-1.5 text-[#6B6B6B] hover:text-white text-xs border border-[#1F1F1F] rounded-lg px-3 py-2 transition-colors"
          >
            <Download size={12} /> Exportar CSV
          </button>
        </div>

        {carregandoConsolidado ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-[#050505] rounded-lg animate-pulse" />)}
          </div>
        ) : consolidado.length === 0 ? (
          <div className="p-12 text-center"><p className="text-[#6B6B6B] text-sm">Nenhum cliente cadastrado.</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1F1F1F]">
                    {['Cliente', 'Status', 'Conversas', 'Custo API', 'Valor a cobrar', 'Expiração', ''].map(h => (
                      <th key={h} className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consolidado.map(t => {
                    const cfg = statusConfig(t.status)
                    const custoReais = t.custoUsd * 5.8
                    const valorCobrar = custoReais * 3
                    return (
                      <tr key={t.id} className="border-b border-[#1F1F1F] last:border-0 hover:bg-[#141414] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#1F1F1F] flex items-center justify-center text-[#A3A3A3] text-xs font-semibold flex-shrink-0">
                              {t.nome.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium">{t.nome}</p>
                              <p className="text-[#6B6B6B] text-xs font-mono">{t.slug}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border" style={{ color: cfg.cor, background: cfg.bg, borderColor: cfg.border }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.cor }} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-white text-sm font-medium">{t.conversasMes.toLocaleString('pt-BR')}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-white text-sm">{custoReais > 0 ? `R$ ${custoReais.toFixed(2)}` : '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-semibold ${valorCobrar > 0 ? 'text-[#10B981]' : 'text-[#3A3A3A]'}`}>
                            {valorCobrar > 0 ? `R$ ${valorCobrar.toFixed(2)}` : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[#A3A3A3] text-sm">
                            {t.expira_em ? new Date(t.expira_em).toLocaleDateString('pt-BR') : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link href="/admin/clientes" className="text-[#3A3A3A] hover:text-white transition-colors">
                            <ChevronRight size={15} />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totais */}
            <div className="flex items-center justify-end gap-8 px-6 py-4 border-t border-[#1F1F1F] bg-[#050505]">
              <div className="text-right">
                <p className="text-[#6B6B6B] text-xs mb-0.5">Total custo API</p>
                <p className="text-white text-sm font-semibold">{custoTotalReais > 0 ? `R$ ${custoTotalReais.toFixed(2)}` : '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-[#6B6B6B] text-xs mb-0.5">Total a cobrar (3x)</p>
                <p className="text-[#10B981] text-sm font-bold">{valorTotalCobrar > 0 ? `R$ ${valorTotalCobrar.toFixed(2)}` : '—'}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { href: '/admin/clientes',    label: 'Gerenciar Clientes',    sub: 'Cadastrar, editar e controlar acessos',  icon: Users, cor: '#3B82F6' },
          { href: '/admin/treinamento', label: 'Treinamento de Agentes', sub: 'Editar prompts e base de conhecimento', icon: Bot,   cor: '#8B5CF6' },
          { href: '/admin/custos',      label: 'Custos de IA',          sub: 'Consumo de tokens por cliente',          icon: Wallet, cor: '#10B981' },
        ].map(({ href, label, sub, icon: Icon, cor }) => (
          <Link key={href} href={href} className="bg-[#0A0A0A] border border-[#1F1F1F] hover:border-[#2A2A2A] rounded-xl p-5 transition-colors group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cor}18` }}>
                <Icon size={16} color={cor} />
              </div>
              <span className="text-white text-sm font-semibold group-hover:text-[#10B981] transition-colors">{label}</span>
            </div>
            <p className="text-[#6B6B6B] text-xs">{sub}</p>
          </Link>
        ))}
      </div>

    </div>
  )
}
