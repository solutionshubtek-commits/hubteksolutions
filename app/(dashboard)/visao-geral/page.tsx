'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare, Users, Clock, PauseCircle,
  ArrowUp, ArrowDown, Play, Pause, Phone,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface TenantInfo {
  id: string
  nome: string
}

interface UserInfo {
  nome: string
  tenant_id: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`
  return `${Math.floor(diff / 86400)} d`
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, valor, delta: d, icon: Icon, cor }: {
  label: string; valor: number; delta: number | null; icon: React.ElementType; cor: string
}) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#A3A3A3] text-sm">{label}</p>
        <Icon size={18} color={cor} />
      </div>
      <p className="text-white text-3xl font-bold mb-2">{valor.toLocaleString('pt-BR')}</p>
      {d != null ? (
        <span className={`flex items-center gap-0.5 text-xs font-medium ${d >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
          {d >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          {Math.abs(d)}% vs. período anterior
        </span>
      ) : (
        <span className="text-[#3A3A3A] text-xs">sem dados anteriores</span>
      )}
    </div>
  )
}

// ─── Gráfico de barras ────────────────────────────────────────────────────────

function GraficoBarras({ dados, periodo }: { dados: DiaDado[]; periodo: '7' | '30' | '90' }) {
  if (dados.length === 0) return (
    <div className="flex items-center justify-center h-48 text-[#3A3A3A] text-sm">
      Nenhum dado no período
    </div>
  )
  const max = Math.max(...dados.map(d => d.total), 1)
  const total = dados.reduce((s, d) => s + d.total, 0)
  const media = Math.round(total / dados.length)
  const pico = Math.max(...dados.map(d => d.total))

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        <div><p className="text-[#6B6B6B] text-xs mb-0.5">Total no período</p><p className="text-[#10B981] text-lg font-bold">{total.toLocaleString('pt-BR')}</p></div>
        <div><p className="text-[#6B6B6B] text-xs mb-0.5">Média diária</p><p className="text-white text-lg font-bold">{media}</p></div>
        <div><p className="text-[#6B6B6B] text-xs mb-0.5">Pico</p><p className="text-white text-lg font-bold">{pico}</p></div>
      </div>
      <div className="flex items-end gap-1 h-40 overflow-x-auto pb-1">
        {dados.map((d, i) => {
          const pct = (d.total / max) * 100
          const mostrarLabel = periodo === '7' || (periodo === '30' && i % 5 === 0) || (periodo === '90' && i % 15 === 0)
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[12px] group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 bg-[#1F1F1F] border border-[#2A2A2A] rounded px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {d.dia}: {d.total}
              </div>
              <div
                className="w-full rounded-sm bg-[#10B981] hover:bg-[#34D399] transition-colors cursor-pointer"
                style={{ height: `${Math.max(pct, 2)}%`, minHeight: 2 }}
              />
              {mostrarLabel && (
                <span className="text-[#3A3A3A] text-[9px] whitespace-nowrap">
                  {d.dia.slice(5)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VisaoGeralPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [conversas, setConversas] = useState<ConversaRecente[]>([])
  const [grafico, setGrafico] = useState<DiaDado[]>([])
  const [periodo, setPeriodo] = useState<'7' | '30' | '90'>('30')
  const [carregando, setCarregando] = useState(true)
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [pausando, setPausando] = useState<string | null>(null)

  const fetchTudo = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: userData } = await supabase
      .from('users')
      .select('nome, tenant_id')
      .eq('id', user.id)
      .single()

    if (!userData?.tenant_id) return
    setUserInfo(userData)

    const { data: tenantData } = await supabase
      .from('tenants')
      .select('id, nome')
      .eq('id', userData.tenant_id)
      .single()

    if (tenantData) setTenantInfo(tenantData)

    const agora = new Date()
    const tenantId = userData.tenant_id

    // Períodos
    const hojeInicio = new Date(agora); hojeInicio.setHours(0, 0, 0, 0)
    const ontemInicio = new Date(hojeInicio); ontemInicio.setDate(ontemInicio.getDate() - 1)
    const semanaInicio = new Date(agora); semanaInicio.setDate(semanaInicio.getDate() - 7)
    const semanaAntInicio = new Date(agora); semanaAntInicio.setDate(semanaAntInicio.getDate() - 14)
    const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
    const mesAntInicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
    const mesAntFim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59)

    const [
      hojeRes, ontemRes,
      semanaRes, semanaAntRes,
      mesRes, mesAntRes,
      pausadasRes, pausadasAntRes,
      conversasRes,
    ] = await Promise.all([
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', hojeInicio.toISOString()),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', ontemInicio.toISOString()).lt('criado_em', hojeInicio.toISOString()),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', semanaInicio.toISOString()),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', semanaAntInicio.toISOString()).lt('criado_em', semanaInicio.toISOString()),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', mesInicio.toISOString()),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', mesAntInicio.toISOString()).lte('criado_em', mesAntFim.toISOString()),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('agente_pausado', true),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('agente_pausado', true).lt('pausado_em', hojeInicio.toISOString()),
      supabase.from('conversations').select('id, contato_nome, contato_telefone, status, agente_pausado, ultima_mensagem_em').eq('tenant_id', tenantId).eq('status', 'ativa').order('ultima_mensagem_em', { ascending: false }).limit(10),
    ])

    setMetrics({
      conversasHoje: hojeRes.count ?? 0,
      conversasHojeAnterior: ontemRes.count ?? 0,
      conversasSemana: semanaRes.count ?? 0,
      conversasSemanaAnterior: semanaAntRes.count ?? 0,
      conversasMes: mesRes.count ?? 0,
      conversasMesAnterior: mesAntRes.count ?? 0,
      pausadas: pausadasRes.count ?? 0,
      pausadasAnterior: pausadasAntRes.count ?? 0,
    })

    // Busca última mensagem de cada conversa
    const convComMsg: ConversaRecente[] = await Promise.all(
      (conversasRes.data ?? []).map(async (c) => {
        const { data: msg } = await supabase
          .from('messages')
          .select('conteudo')
          .eq('conversation_id', c.id)
          .order('criado_em', { ascending: false })
          .limit(1)
          .single()
        return {
          ...c,
          ultima_mensagem: msg?.conteudo ?? '—',
        }
      })
    )
    setConversas(convComMsg)
    setCarregando(false)
  }, [])

  // Busca dados do gráfico conforme período
  const fetchGrafico = useCallback(async (p: '7' | '30' | '90') => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    if (!userData?.tenant_id) return

    const dias = parseInt(p)
    const inicio = new Date(); inicio.setDate(inicio.getDate() - dias); inicio.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('conversations')
      .select('criado_em')
      .eq('tenant_id', userData.tenant_id)
      .gte('criado_em', inicio.toISOString())

    // Agrupar por dia
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
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-6xl">
          <div className="h-8 bg-[#0A0A0A] rounded w-48 mb-2 animate-pulse" />
          <div className="h-4 bg-[#0A0A0A] rounded w-72 mb-8 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl animate-pulse" />)}
          </div>
          <div className="h-64 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[#6B6B6B] text-sm">{saudacao()}, {userInfo?.nome?.split(' ')[0] ?? 'usuário'}</p>
            <h1 className="text-white text-2xl font-bold">Visão Geral</h1>
            {tenantInfo && <p className="text-[#A3A3A3] text-sm mt-0.5">Como seu agente de atendimento performou nos últimos 30 dias.</p>}
          </div>
          {tenantInfo && (
            <div className="hidden md:flex items-center gap-2 bg-[#0A0A0A] border border-[#1F1F1F] rounded-lg px-3 py-2">
              <div className="w-6 h-6 rounded bg-[#10B981]/10 flex items-center justify-center text-[#10B981] text-xs font-bold">
                {tenantInfo.nome.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-white text-sm font-medium">{tenantInfo.nome}</span>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Novas conversas hoje" valor={metrics!.conversasHoje} delta={delta(metrics!.conversasHoje, metrics!.conversasHojeAnterior)} icon={MessageSquare} cor="#10B981" />
          <KpiCard label="Conversas na semana" valor={metrics!.conversasSemana} delta={delta(metrics!.conversasSemana, metrics!.conversasSemanaAnterior)} icon={Clock} cor="#3B82F6" />
          <KpiCard label="Conversas no mês" valor={metrics!.conversasMes} delta={delta(metrics!.conversasMes, metrics!.conversasMesAnterior)} icon={Users} cor="#8B5CF6" />
          <KpiCard label="Pausadas (atend. humano)" valor={metrics!.pausadas} delta={delta(metrics!.pausadas, metrics!.pausadasAnterior)} icon={PauseCircle} cor="#F59E0B" />
        </div>

        {/* Gráfico + Atividade recente */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gráfico */}
          <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-semibold">Volume de conversas</h2>
                <p className="text-[#6B6B6B] text-xs mt-0.5">Total agregado por dia</p>
              </div>
              <div className="flex gap-1">
                {(['7', '30', '90'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriodo(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${periodo === p ? 'bg-[#10B981] text-white' : 'text-[#6B6B6B] hover:text-white hover:bg-[#1F1F1F]'}`}
                  >
                    {p} dias
                  </button>
                ))}
              </div>
            </div>
            <GraficoBarras dados={grafico} periodo={periodo} />
          </div>

          {/* Atividade recente */}
          <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6">
            <h2 className="text-white font-semibold mb-1">Atividade recente</h2>
            <p className="text-[#6B6B6B] text-xs mb-4">Eventos do agente em tempo real.</p>
            <div className="space-y-3">
              {conversas.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${c.agente_pausado ? 'bg-[#F59E0B]' : 'bg-[#10B981]'}`} />
                  <div className="min-w-0">
                    <p className="text-white text-xs font-medium truncate">{c.contato_nome || c.contato_telefone}</p>
                    <p className="text-[#6B6B6B] text-xs truncate">{c.agente_pausado ? 'Aguardando atendimento humano' : 'Conversa ativa com agente'}</p>
                    <p className="text-[#3A3A3A] text-xs">{tempoRelativo(c.ultima_mensagem_em)}</p>
                  </div>
                </div>
              ))}
              {conversas.length === 0 && <p className="text-[#3A3A3A] text-sm">Nenhuma atividade recente.</p>}
            </div>
          </div>
        </div>

        {/* Conversas recentes */}
        <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
            <div>
              <h2 className="text-white font-semibold">Conversas recentes</h2>
              <p className="text-[#6B6B6B] text-xs mt-0.5">{conversas.length} conversas ativas. Pause o agente para assumir o controle.</p>
            </div>
          </div>

          {conversas.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare size={24} className="text-[#3A3A3A] mx-auto mb-2" />
              <p className="text-[#6B6B6B] text-sm">Nenhuma conversa ativa no momento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1F1F1F]">
                    <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3 uppercase tracking-wider">Contato</th>
                    <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3 uppercase tracking-wider">Telefone</th>
                    <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3 uppercase tracking-wider">Última mensagem</th>
                    <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3 uppercase tracking-wider">Status</th>
                    <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3 uppercase tracking-wider">Hora</th>
                    <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {conversas.map(c => (
                    <tr key={c.id} className="border-b border-[#1F1F1F] last:border-0 hover:bg-[#141414] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#1F1F1F] flex items-center justify-center text-[#A3A3A3] text-xs font-semibold flex-shrink-0">
                            {(c.contato_nome || c.contato_telefone).slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-white text-sm font-medium">{c.contato_nome || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-[#A3A3A3] text-sm">
                          <Phone size={12} />
                          {formatFone(c.contato_telefone)}
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-[#A3A3A3] text-sm truncate">{c.ultima_mensagem}</p>
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
                        <span className="text-[#6B6B6B] text-sm">{tempoRelativo(c.ultima_mensagem_em)}</span>
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
    </div>
  )
}
