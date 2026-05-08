'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare, Users, Clock, PauseCircle,
  ArrowUp, ArrowDown, Play, Pause, Phone,
  Filter, Download,
} from 'lucide-react'

interface Metrics {
  conversasHoje: number
  conversasHojeAnterior: number
  conversasSemana: number
  conversasSemanaAnterior: number
  conversasMes: number
  conversasMesAnterior: number
  pausadas: number
  pausadasAnterior: number
}

interface ConversaRecente {
  id: string
  contato_nome: string
  contato_telefone: string
  ultima_mensagem: string
  status: string
  agente_pausado: boolean
  ultima_mensagem_em: string
}

interface DiaDado {
  dia: string
  total: number
}

function delta(atual: number, anterior: number) {
  if (!anterior) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function formatFone(fone: string) {
  const d = fone.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return fone
}

function tempoRelativo(data: string) {
  const diff = Math.floor((Date.now() - new Date(data).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  return `há ${Math.floor(diff / 86400)} d`
}

function exportarCSV(conversas: ConversaRecente[]) {
  const header = 'Contato,Telefone,Última mensagem,Status,Hora\n'
  const rows = conversas.map(c =>
    `"${c.contato_nome || ''}","${c.contato_telefone}","${c.ultima_mensagem}","${c.agente_pausado ? 'Pausado' : 'Ativo'}","${tempoRelativo(c.ultima_mensagem_em)}"`
  ).join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'conversas.csv'; a.click()
  URL.revokeObjectURL(url)
}

function KpiCard({ label, valor, d, icon: Icon, cor, alt }: {
  label: string; valor: number; d: number | null; icon: React.ElementType; cor: string; alt?: boolean
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${alt ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cor}18` }}>
          <Icon size={16} color={cor} />
        </div>
      </div>
      <p className="text-3xl font-bold mb-2" style={{ color: alt ? '#F59E0B' : 'var(--text-primary)' }}>
        {valor.toLocaleString('pt-BR')}
      </p>
      {d != null ? (
        <span className={`flex items-center gap-0.5 text-xs font-medium ${d >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
          {d >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          {d >= 0 ? '+' : ''}{d}% vs. semana anterior
        </span>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-label)' }}>sem dados anteriores</span>
      )}
    </div>
  )
}

function GraficoBarras({ dados }: { dados: DiaDado[] }) {
  if (dados.length === 0) return (
    <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-label)' }}>
      Nenhum dado no período
    </div>
  )
  const max = Math.max(...dados.map(d => d.total), 1)
  const total = dados.reduce((s, d) => s + d.total, 0)
  const media = dados.length ? Math.round(total / dados.length) : 0
  const pico = Math.max(...dados.map(d => d.total))

  return (
    <div>
      <div className="flex items-center gap-8 mb-4">
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Total no período</p>
          <p className="text-lg font-bold text-[#10B981]">{total.toLocaleString('pt-BR')}</p>
        </div>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Média diária</p>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{media}</p>
        </div>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Pico</p>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{pico}</p>
        </div>
      </div>
      <div className="flex items-end gap-0.5 h-36">
        {dados.map((d, i) => {
          const pct = (d.total / max) * 100
          const opacity = 0.4 + (0.6 * (i / dados.length))
          const showLabel = dados.length <= 7 || i % Math.floor(dados.length / 6) === 0 || i === dados.length - 1
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 flex-1 min-w-[4px] group relative">
              <div
                className="absolute bottom-full mb-1 rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 left-1/2 -translate-x-1/2"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-2)', color: 'var(--text-primary)' }}
              >
                {d.dia.slice(5)}: {d.total}
              </div>
              <div
                className="w-full rounded-sm hover:bg-[#34D399] transition-colors cursor-pointer"
                style={{ height: `${Math.max(pct, 2)}%`, minHeight: 2, background: `rgba(16,185,129,${opacity})` }}
              />
              {showLabel && (
                <span className="text-[9px] whitespace-nowrap" style={{ color: 'var(--text-label)' }}>
                  {d.dia.slice(8)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function VisaoGeralPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [conversas, setConversas] = useState<ConversaRecente[]>([])
  const [conversasFiltradas, setConversasFiltradas] = useState<ConversaRecente[]>([])
  const [grafico, setGrafico] = useState<DiaDado[]>([])
  const [periodo, setPeriodo] = useState<'7' | '30' | '90'>('30')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'pausado'>('todos')
  const [carregando, setCarregando] = useState(true)
  const [nomeUsuario, setNomeUsuario] = useState('')
  const [pausando, setPausando] = useState<string | null>(null)

  const fetchTudo = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: userData } = await supabase.from('users').select('nome, tenant_id').eq('id', user.id).single()
    if (!userData?.tenant_id) return
    setNomeUsuario(userData.nome?.split(' ')[0] ?? '')
    const agora = new Date()
    const tenantId = userData.tenant_id
    const hojeInicio = new Date(agora); hojeInicio.setHours(0, 0, 0, 0)
    const ontemInicio = new Date(hojeInicio); ontemInicio.setDate(ontemInicio.getDate() - 1)
    const semanaInicio = new Date(agora); semanaInicio.setDate(semanaInicio.getDate() - 7)
    const semanaAntInicio = new Date(agora); semanaAntInicio.setDate(semanaAntInicio.getDate() - 14)
    const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
    const mesAntInicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
    const mesAntFim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59)
    const [hojeRes, ontemRes, semRes, semAntRes, mesRes, mesAntRes, pausadasRes, pausadasAntRes, convRes] =
      await Promise.all([
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', hojeInicio.toISOString()),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', ontemInicio.toISOString()).lt('criado_em', hojeInicio.toISOString()),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', semanaInicio.toISOString()),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', semanaAntInicio.toISOString()).lt('criado_em', semanaInicio.toISOString()),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', mesInicio.toISOString()),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', mesAntInicio.toISOString()).lte('criado_em', mesAntFim.toISOString()),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('agente_pausado', true),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('agente_pausado', true).lt('pausado_em', hojeInicio.toISOString()),
        supabase.from('conversations').select('id, contato_nome, contato_telefone, status, agente_pausado, ultima_mensagem_em').eq('tenant_id', tenantId).eq('status', 'ativa').order('ultima_mensagem_em', { ascending: false }).limit(20),
      ])
    setMetrics({
      conversasHoje: hojeRes.count ?? 0,
      conversasHojeAnterior: ontemRes.count ?? 0,
      conversasSemana: semRes.count ?? 0,
      conversasSemanaAnterior: semAntRes.count ?? 0,
      conversasMes: mesRes.count ?? 0,
      conversasMesAnterior: mesAntRes.count ?? 0,
      pausadas: pausadasRes.count ?? 0,
      pausadasAnterior: pausadasAntRes.count ?? 0,
    })
    const convComMsg: ConversaRecente[] = await Promise.all(
      (convRes.data ?? []).map(async (c) => {
        const { data: msg } = await supabase
          .from('messages').select('conteudo').eq('conversation_id', c.id)
          .order('criado_em', { ascending: false }).limit(1).single()
        return { ...c, ultima_mensagem: msg?.conteudo ?? '—' }
      })
    )
    setConversas(convComMsg)
    setConversasFiltradas(convComMsg)
    setCarregando(false)
  }, [])

  const fetchGrafico = useCallback(async (p: '7' | '30' | '90') => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    if (!userData?.tenant_id) return
    const dias = parseInt(p)
    const inicio = new Date(); inicio.setDate(inicio.getDate() - dias); inicio.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('conversations').select('criado_em')
      .eq('tenant_id', userData.tenant_id).gte('criado_em', inicio.toISOString())
    const porDia: Record<string, number> = {}
    const curr = new Date(inicio)
    const hoje = new Date(); hoje.setHours(23, 59, 59, 999)
    while (curr <= hoje) {
      porDia[curr.toISOString().slice(0, 10)] = 0
      curr.setDate(curr.getDate() + 1)
    }
    ;(data ?? []).forEach(c => {
      const dia = c.criado_em.slice(0, 10)
      if (porDia[dia] !== undefined) porDia[dia]++
    })
    setGrafico(Object.entries(porDia).map(([dia, total]) => ({ dia, total })))
  }, [])

  useEffect(() => { fetchTudo() }, [fetchTudo])
  useEffect(() => { fetchGrafico(periodo) }, [periodo, fetchGrafico])
  useEffect(() => {
    if (filtroStatus === 'todos') setConversasFiltradas(conversas)
    else if (filtroStatus === 'ativo') setConversasFiltradas(conversas.filter(c => !c.agente_pausado))
    else setConversasFiltradas(conversas.filter(c => c.agente_pausado))
  }, [filtroStatus, conversas])

  async function handlePausarRetomar(conversa: ConversaRecente) {
    setPausando(conversa.id)
    const supabase = createClient()
    const novoPausado = !conversa.agente_pausado
    await supabase.from('conversations').update({
      agente_pausado: novoPausado,
      pausado_em: novoPausado ? new Date().toISOString() : null,
    }).eq('id', conversa.id)
    setConversas(prev => prev.map(c => c.id === conversa.id ? { ...c, agente_pausado: novoPausado } : c))
    setPausando(null)
  }

  if (carregando) {
    return (
      <div className="p-8">
        <div className="h-8 rounded w-48 mb-2 animate-pulse" style={{ background: 'var(--bg-surface)' }} />
        <div className="h-4 rounded w-72 mb-8 animate-pulse" style={{ background: 'var(--bg-surface)' }} />
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
        <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">

      {/* Page head */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{saudacao()}, {nomeUsuario}</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Visão Geral</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Como seu agente de atendimento performou nos últimos {periodo === '7' ? '7' : periodo === '90' ? '90' : '30'} dias.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {(['7', '30', '90'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: periodo === p ? '#10B981' : 'transparent',
                color: periodo === p ? '#fff' : 'var(--text-muted)',
              }}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Novas conversas hoje"    valor={metrics!.conversasHoje}   d={delta(metrics!.conversasHoje, metrics!.conversasHojeAnterior)}     icon={MessageSquare} cor="#10B981" />
        <KpiCard label="Conversas na semana"      valor={metrics!.conversasSemana} d={delta(metrics!.conversasSemana, metrics!.conversasSemanaAnterior)} icon={Clock}         cor="#3B82F6" />
        <KpiCard label="Conversas no mês"         valor={metrics!.conversasMes}    d={delta(metrics!.conversasMes, metrics!.conversasMesAnterior)}       icon={Users}         cor="#8B5CF6" />
        <KpiCard label="Pausadas (atend. humano)" valor={metrics!.pausadas}        d={delta(metrics!.pausadas, metrics!.pausadasAnterior)}               icon={PauseCircle}   cor="#F59E0B" alt />
      </div>

      {/* Gráfico + Atividade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Volume de conversas — últimos {periodo} dias</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Total agregado por dia, incluindo automatizadas e humanas.</p>
            </div>
            <button
              className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <Download size={12} />
            </button>
          </div>
          <GraficoBarras dados={grafico} />
        </div>

        <div className="rounded-xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Atividade recente</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Eventos do agente em tempo real.</p>
          <div className="space-y-4">
            {conversas.slice(0, 6).map(c => (
              <div key={c.id} className="flex items-start gap-2.5">
                <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${c.agente_pausado ? 'bg-[#F59E0B]' : 'bg-[#10B981]'}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                    <span className="font-semibold">{c.contato_nome || c.contato_telefone}</span>{' '}
                    {c.agente_pausado ? 'solicitou atendimento humano.' : 'está em conversa com o agente.'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-label)' }}>{tempoRelativo(c.ultima_mensagem_em)}</p>
                </div>
              </div>
            ))}
            {conversas.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-label)' }}>Nenhuma atividade recente.</p>
            )}
          </div>
        </div>
      </div>

      {/* Conversas recentes */}
      <div className="rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Conversas recentes</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {conversasFiltradas.length} conversa{conversasFiltradas.length !== 1 ? 's' : ''} ativa{conversasFiltradas.length !== 1 ? 's' : ''}. Pause o agente em qualquer linha para assumir o controle.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
              {([['todos', 'Todos'], ['ativo', 'Ativos'], ['pausado', 'Pausados']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFiltroStatus(val)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: filtroStatus === val ? 'var(--bg-hover)' : 'transparent',
                    color: filtroStatus === val ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  <Filter size={10} />{label}
                </button>
              ))}
            </div>
            <button
              onClick={() => exportarCSV(conversasFiltradas)}
              className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <Download size={12} /> Exportar
            </button>
          </div>
        </div>

        {conversasFiltradas.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare size={24} className="mx-auto mb-2" style={{ color: 'var(--text-label)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma conversa encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Contato', 'Telefone', 'Última mensagem', 'Status', 'Hora', 'Ações'].map(h => (
                    <th key={h} className="text-left text-xs font-medium px-6 py-3 uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversasFiltradas.map(c => (
                  <tr key={c.id} className="transition-colors last:border-0"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                          {(c.contato_nome || c.contato_telefone).slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {c.contato_nome || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <Phone size={12} />{formatFone(c.contato_telefone)}
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{c.ultima_mensagem}</p>
                    </td>
                    <td className="px-6 py-4">
                      {c.agente_pausado ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" /> Pausado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> Ativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{tempoRelativo(c.ultima_mensagem_em)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handlePausarRetomar(c)}
                        disabled={pausando === c.id}
                        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                          c.agente_pausado
                            ? 'bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 border border-[#10B981]/30'
                            : 'bg-[#F59E0B]/10 text-[#F59E0B] hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30'
                        }`}
                      >
                        {c.agente_pausado ? <><Play size={11} /> Retomar</> : <><Pause size={11} /> Pausar</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
