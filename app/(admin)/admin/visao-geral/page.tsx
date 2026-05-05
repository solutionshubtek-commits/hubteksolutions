'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, MessageSquare, AlertTriangle, Wallet, Plus, ArrowUp, ArrowDown } from 'lucide-react'
import Link from 'next/link'

interface KpiData {
  clientesAtivos: number
  clientesTotal: number
  clientesBloqueados: number
  conversasMes: number
  conversasAnterior: number
  acessosExpirando: number
  tenantsExpirando: { nome: string; slug: string; expira_em: string }[]
}

function deltaPct(atual: number, anterior: number) {
  if (!anterior) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

function KpiCard({
  label, value, sub, delta, icon: Icon, accent, cor,
}: {
  label: string
  value: string | number
  sub?: string
  delta?: number | null
  icon: React.ElementType
  accent?: boolean
  cor?: string
}) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#A3A3A3] text-sm">{label}</p>
        <Icon size={18} color={cor ?? '#6B6B6B'} />
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

export default function AdminVisaoGeralPage() {
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      const agora = new Date()
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
      const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString()
      const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59).toISOString()
      const em10Dias = new Date(agora.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()

      const [
        tenantsRes,
        conversasMesRes,
        conversasAntRes,
        expirando,
      ] = await Promise.all([
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
    }
    fetchData()
  }, [])

  if (carregando) {
    return (
      <div>
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

  return (
    <div>
      {/* Page head */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[#6B6B6B] text-sm mb-1">Painel Administrativo</p>
          <h1 className="text-white text-2xl font-bold">Visão Geral Consolidada</h1>
          <p className="text-[#A3A3A3] text-sm mt-1">
            Saúde da operação e performance de todos os clientes ativos.
          </p>
        </div>
        <Link
          href="/admin/clientes"
          className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={15} />
          Novo cliente
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Clientes ativos"
          value={kpi!.clientesAtivos}
          sub={`${kpi!.clientesBloqueados} bloqueado · ${kpi!.clientesTotal} total`}
          icon={Users}
          cor="#3B82F6"
        />
        <KpiCard
          label="Conversas no mês"
          value={kpi!.conversasMes.toLocaleString('pt-BR')}
          sub="todos os clientes ativos"
          delta={deltaConversas}
          icon={MessageSquare}
          cor="#10B981"
        />
        <KpiCard
          label="Custo de IA"
          value="—"
          sub="integração futura"
          icon={Wallet}
          cor="#10B981"
          accent
        />
        <KpiCard
          label="Acessos a expirar"
          value={kpi!.acessosExpirando}
          sub="próximos 10 dias"
          icon={AlertTriangle}
          cor="#F59E0B"
        />
      </div>

      {/* Alertas de expiração */}
      {kpi!.tenantsExpirando.length > 0 && (
        <div className="bg-[#0A0A0A] border border-[#F59E0B]/30 rounded-xl p-5 mb-8">
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

      {/* Atalhos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { href: '/admin/clientes',    label: 'Gerenciar Clientes',   sub: 'Cadastrar, editar e controlar acessos', icon: Users,          cor: '#3B82F6' },
          { href: '/admin/treinamento', label: 'Treinamento de Agentes', sub: 'Editar prompts e base de conhecimento', icon: Bot,            cor: '#8B5CF6' },
          { href: '/admin/custos',      label: 'Custos de IA',         sub: 'Consumo de tokens por cliente',          icon: Wallet,         cor: '#10B981' },
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

// Bot icon inline (lucide não tem Bot no pacote básico às vezes)
function Bot({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2"/>
      <path d="M12 4v4M8 14h.01M16 14h.01M9 18h6"/>
    </svg>
  )
}
