'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { RefreshCw, ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'
import { CRMCardModal } from '@/components/dashboard/CRMCardModal'
import { ETAPAS_FUNIL, LABELS_ETAPA, LABELS_FUNIL } from '@/lib/crm'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CRMLead {
  id: string
  conversation_id: string
  contato_nome: string | null
  contato_telefone: string
  funil_tipo: string
  etapa: string
  etapa_anterior: string | null
  movido_por: string
  resumo: string | null
  criado_em: string
  atualizado_em: string
  conversa_encerrada: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(nome: string | null, telefone: string): string {
  if (nome) return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  return telefone.slice(-2)
}

const AVATAR_COLORS = [
  { bg: 'rgba(99,102,241,.15)',  color: '#818CF8' },
  { bg: 'rgba(34,211,238,.15)',  color: '#22D3EE' },
  { bg: 'rgba(251,146,60,.15)',  color: '#FB923C' },
  { bg: 'rgba(251,191,36,.15)',  color: '#FBBF24' },
  { bg: 'rgba(167,139,250,.15)', color: '#A78BFA' },
  { bg: 'rgba(52,211,153,.15)',  color: '#34D399' },
]

function avatarColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function tempoRelativo(data: string): string {
  const diff = Math.floor((Date.now() - new Date(data).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  return `há ${Math.floor(diff / 86400)} d`
}

function formatarDataBR(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

type FiltroVista = 'ativas' | 'todas'

// ─── Mini calendário ──────────────────────────────────────────────────────────

function MiniCalendario({
  ano, mes, dataInicio, dataFim, hoverDate,
  onSelectDia, onHoverDia, onNavMes,
}: {
  ano: number
  mes: number
  dataInicio: Date | null
  dataFim: Date | null
  hoverDate: Date | null
  onSelectDia: (d: Date) => void
  onHoverDia: (d: Date | null) => void
  onNavMes: (delta: number) => void
}) {
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes   = new Date(ano, mes + 1, 0).getDate()
  const hoje = new Date(); hoje.setHours(0,0,0,0)

  const cells: (Date | null)[] = []
  for (let i = 0; i < primeiroDia; i++) cells.push(null)
  for (let d = 1; d <= diasNoMes; d++) cells.push(new Date(ano, mes, d))

  function isInRange(d: Date) {
    if (!dataInicio) return false
    const fim = dataFim ?? hoverDate
    if (!fim) return false
    const [a, b] = dataInicio <= fim ? [dataInicio, fim] : [fim, dataInicio]
    return d > a && d < b
  }

  function isSelected(d: Date) {
    if (dataInicio && d.getTime() === dataInicio.getTime()) return true
    if (dataFim   && d.getTime() === dataFim.getTime())    return true
    return false
  }

  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <button onClick={() => onNavMes(-1)}
          style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ChevronLeft size={13} />
        </button>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)' }}>
          {MESES[mes]} {ano}
        </span>
        <button onClick={() => onNavMes(1)}
          style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ChevronRight size={13} />
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {DIAS_SEMANA.map((d,i) => (
          <div key={i} style={{ textAlign:'center', fontSize:10, fontWeight:600, color:'var(--text-muted)', padding:'2px 0' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const sel    = isSelected(d)
          const range  = isInRange(d)
          const isHoje = d.getTime() === hoje.getTime()
          return (
            <div key={i}
              onClick={() => onSelectDia(d)}
              onMouseEnter={() => onHoverDia(d)}
              onMouseLeave={() => onHoverDia(null)}
              style={{
                width:30, height:28, margin:'auto',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:11, cursor:'pointer', borderRadius:6,
                fontWeight: sel ? 600 : 400,
                background: sel ? '#10B981' : range ? 'rgba(16,185,129,.12)' : 'transparent',
                color: sel ? '#000' : isHoje ? '#10B981' : 'var(--text-primary)',
                border: isHoje && !sel ? '1px solid rgba(16,185,129,.4)' : '1px solid transparent',
              }}>
              {d.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CRMPage() {
  const [leads, setLeads]           = useState<CRMLead[]>([])
  const [tenantId, setTenantId]     = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [funilAtivo, setFunilAtivo] = useState<string>('vendas')
  const [modalLead, setModalLead]   = useState<CRMLead | null>(null)
  const [movendo, setMovendo]       = useState(false)
  const [filtro, setFiltro]         = useState<FiltroVista>('ativas')

  // Calendário
  const [showCal, setShowCal]         = useState(false)
  const [dataInicio, setDataInicio]   = useState<Date | null>(null)
  const [dataFim, setDataFim]         = useState<Date | null>(null)
  const [hoverDate, setHoverDate]     = useState<Date | null>(null)
  const [selecionando, setSelecionando] = useState<'inicio' | 'fim'>('inicio')
  const [mesEsq, setMesEsq]           = useState(() => { const n = new Date(); return { ano: n.getFullYear(), mes: n.getMonth() === 0 ? 11 : n.getMonth() - 1 } })
  const [mesDir, setMesDir]           = useState(() => { const n = new Date(); return { ano: n.getFullYear(), mes: n.getMonth() } })
  const calRef = useRef<HTMLDivElement>(null)

  // Fecha calendário ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setShowCal(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function navMes(delta: number, lado: 'esq' | 'dir') {
    if (lado === 'esq') {
      setMesEsq(prev => {
        let m = prev.mes + delta, a = prev.ano
        if (m < 0) { m = 11; a-- } else if (m > 11) { m = 0; a++ }
        return { ano: a, mes: m }
      })
    } else {
      setMesDir(prev => {
        let m = prev.mes + delta, a = prev.ano
        if (m < 0) { m = 11; a-- } else if (m > 11) { m = 0; a++ }
        return { ano: a, mes: m }
      })
    }
  }

  function selecionarDia(d: Date) {
    d.setHours(0,0,0,0)
    if (selecionando === 'inicio' || !dataInicio) {
      setDataInicio(d)
      setDataFim(null)
      setSelecionando('fim')
    } else {
      if (d < dataInicio) {
        setDataInicio(d)
        setDataFim(null)
        setSelecionando('fim')
      } else {
        setDataFim(d)
        setSelecionando('inicio')
        setShowCal(false)
      }
    }
  }

  function limparPeriodo() {
    setDataInicio(null)
    setDataFim(null)
    setSelecionando('inicio')
    setShowCal(false)
  }

  const fetchLeads = useCallback(async (tid: string) => {
    const res = await fetch(`/api/crm?tenant_id=${tid}`)
    const json = await res.json() as { leads: CRMLead[] }
    setLeads(json.leads ?? [])
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) return
      setTenantId(userData.tenant_id)
      const { data: agentConfig } = await supabase
        .from('agent_config').select('funcoes_ativas').eq('tenant_id', userData.tenant_id).maybeSingle()
      const funcoes = (agentConfig?.funcoes_ativas as string[]) ?? []
      setFunilAtivo(funcoes[0] ?? 'vendas')
      await fetchLeads(userData.tenant_id)
      setCarregando(false)
    }
    init()
  }, [fetchLeads])

  useEffect(() => {
    if (!tenantId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`crm-leads-${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'crm_leads', filter: `tenant_id=eq.${tenantId}` },
        () => { fetchLeads(tenantId) }
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tenantId, fetchLeads])

  async function onDragEnd(result: DropResult) {
    const { draggableId, destination } = result
    if (!destination) return
    const lead = leads.find(l => l.id === draggableId)
    if (!lead || lead.etapa === destination.droppableId || lead.conversa_encerrada) return

    setLeads(prev => prev.map(l =>
      l.id === draggableId
        ? { ...l, etapa: destination.droppableId, etapa_anterior: l.etapa, movido_por: 'humano', atualizado_em: new Date().toISOString() }
        : l
    ))
    setMovendo(true)
    try {
      await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draggableId, etapa: destination.droppableId, movido_por: 'humano' }),
      })
    } catch (err) {
      console.error('[CRM] Erro ao mover lead:', err)
      if (tenantId) fetchLeads(tenantId)
    } finally {
      setMovendo(false)
    }
    if (modalLead?.id === draggableId) {
      setModalLead(prev => prev ? { ...prev, etapa: destination.droppableId } : prev)
    }
  }

  // ─── Filtragem ───────────────────────────────────────────────────────────────

  const etapas       = ETAPAS_FUNIL[funilAtivo] ?? []
  const labels       = LABELS_ETAPA[funilAtivo] ?? {}
  const leadsDoFunil = leads.filter(l => l.funil_tipo === funilAtivo)

  const leadsFiltrados = leadsDoFunil.filter(l => {
    if (filtro === 'ativas' && l.conversa_encerrada) return false
    if (dataInicio) {
      const ini = new Date(dataInicio); ini.setHours(0,0,0,0)
      if (new Date(l.atualizado_em) < ini) return false
    }
    if (dataFim) {
      const fim = new Date(dataFim); fim.setHours(23,59,59,999)
      if (new Date(l.atualizado_em) > fim) return false
    }
    return true
  })

  const totalAtivas     = leadsDoFunil.filter(l => !l.conversa_encerrada).length
  const totalEncerradas = leadsDoFunil.filter(l => l.conversa_encerrada).length
  const periodoAtivo    = !!(dataInicio || dataFim)

  const labelPeriodo = dataInicio && dataFim
    ? `${formatarDataBR(dataInicio)} – ${formatarDataBR(dataFim)}`
    : dataInicio
    ? `A partir de ${formatarDataBR(dataInicio)}`
    : 'Período'

  if (carregando) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 rounded animate-pulse mb-6" style={{ background: 'var(--bg-surface)' }} />
        <div className="flex gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-48 h-64 rounded-xl animate-pulse flex-shrink-0" style={{ background: 'var(--bg-surface)' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 gap-3 flex-wrap"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>CRM</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Funil de {LABELS_FUNIL[funilAtivo] ?? funilAtivo} · {totalAtivas} ativa{totalAtivas !== 1 ? 's' : ''}
            {totalEncerradas > 0 && ` · ${totalEncerradas} encerrada${totalEncerradas !== 1 ? 's' : ''}`}
            {periodoAtivo && ` · ${leadsFiltrados.length} no período`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {movendo && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}

          {/* Toggle ativas/todas */}
          <div className="flex items-center rounded-lg p-1"
            style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
            {(['ativas', 'todas'] as FiltroVista[]).map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: filtro === f ? 'var(--bg-hover)' : 'transparent',
                  color: filtro === f ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                {f === 'ativas' ? 'Ativas' : 'Todas'}
                {f === 'todas' && totalEncerradas > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                    +{totalEncerradas}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Botão período com popover calendário */}
          <div className="relative" ref={calRef}>
            <button
              onClick={() => setShowCal(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: periodoAtivo ? 'rgba(16,185,129,.1)' : 'var(--bg-surface-2)',
                border: `1px solid ${periodoAtivo ? 'rgba(16,185,129,.3)' : 'var(--border)'}`,
                color: periodoAtivo ? '#10B981' : 'var(--text-muted)',
              }}>
              <Calendar size={13} />
              {labelPeriodo}
              {periodoAtivo && (
                <span onClick={(e) => { e.stopPropagation(); limparPeriodo() }}
                  className="ml-1 hover:opacity-70">
                  <X size={11} />
                </span>
              )}
            </button>

            {showCal && (
              <div className="absolute right-0 top-9 z-50 rounded-xl shadow-2xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: 16, width: 500 }}>

                {/* Instrução */}
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                  {selecionando === 'inicio' || !dataInicio
                    ? 'Selecione a data inicial'
                    : 'Selecione a data final'}
                </p>

                {/* Dois calendários */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <MiniCalendario
                    ano={mesEsq.ano} mes={mesEsq.mes}
                    dataInicio={dataInicio} dataFim={dataFim} hoverDate={hoverDate}
                    onSelectDia={selecionarDia}
                    onHoverDia={d => { if (dataInicio && !dataFim) setHoverDate(d) }}
                    onNavMes={d => navMes(d, 'esq')}
                  />
                  <MiniCalendario
                    ano={mesDir.ano} mes={mesDir.mes}
                    dataInicio={dataInicio} dataFim={dataFim} hoverDate={hoverDate}
                    onSelectDia={selecionarDia}
                    onHoverDia={d => { if (dataInicio && !dataFim) setHoverDate(d) }}
                    onNavMes={d => navMes(d, 'dir')}
                  />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-4 pt-3"
                  style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {dataInicio && dataFim
                      ? `${formatarDataBR(dataInicio)} – ${formatarDataBR(dataFim)}`
                      : dataInicio
                      ? `${formatarDataBR(dataInicio)} – selecione o fim`
                      : 'Nenhum período selecionado'}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={limparPeriodo}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ border: '1px solid var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}>
                      Limpar
                    </button>
                    <button onClick={() => setShowCal(false)}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                      style={{ background: '#10B981', color: '#000', border: 'none' }}>
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', color: '#10B981' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            {LABELS_FUNIL[funilAtivo] ?? funilAtivo}
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 p-4 h-full" style={{ minWidth: 'max-content' }}>
            {etapas.map((etapa) => {
              const isPositivo   = etapa === etapas[etapas.length - 2]
              const isNegativo   = etapa === etapas[etapas.length - 1]
              const leadsNaEtapa = leadsFiltrados.filter(l => l.etapa === etapa)

              return (
                <div key={etapa} className="flex flex-col rounded-xl flex-shrink-0"
                  style={{
                    width: 200,
                    background: 'var(--bg-surface)',
                    border: `1px solid ${isPositivo ? 'rgba(52,211,153,.25)' : isNegativo ? 'rgba(248,113,113,.25)' : 'var(--border)'}`,
                  }}>
                  <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-xs" style={{
                      fontWeight: 600,
                      color: isPositivo ? '#34D399' : isNegativo ? '#F87171' : 'var(--text-primary)',
                    }}>
                      {labels[etapa] ?? etapa}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {leadsNaEtapa.length}
                    </span>
                  </div>

                  <Droppable droppableId={etapa}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}
                        className="flex-1 overflow-y-auto p-2 space-y-2"
                        style={{
                          minHeight: 80,
                          background: snapshot.isDraggingOver ? 'rgba(16,185,129,.04)' : 'transparent',
                          transition: 'background .15s',
                        }}>
                        {leadsNaEtapa.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex items-center justify-center h-16 rounded-lg text-xs"
                            style={{ color: 'var(--text-label)', border: '1px dashed var(--border)' }}>
                            Vazio
                          </div>
                        )}
                        {leadsNaEtapa.map((lead, index) => {
                          const av = avatarColor(lead.id)
                          const encerrado = lead.conversa_encerrada
                          return (
                            <Draggable key={lead.id} draggableId={lead.id} index={index} isDragDisabled={encerrado}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  onClick={() => setModalLead(lead)}
                                  className="rounded-lg p-2.5 select-none"
                                  style={{
                                    cursor:     encerrado ? 'pointer' : 'grab',
                                    opacity:    encerrado ? 0.55 : 1,
                                    background: snap.isDragging ? 'var(--bg-hover)' : 'var(--bg-surface-2)',
                                    border:     `1px solid ${snap.isDragging ? 'var(--border-2)' : 'var(--border)'}`,
                                    boxShadow:  snap.isDragging ? '0 8px 24px rgba(0,0,0,.4)' : 'none',
                                    transform:  snap.isDragging ? 'rotate(1.5deg)' : 'none',
                                    transition: snap.isDragging ? 'none' : 'border-color .15s, opacity .15s',
                                    ...prov.draggableProps.style,
                                  }}>
                                  {encerrado && (
                                    <div className="flex justify-end mb-1">
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                        style={{ background: 'rgba(107,107,107,.15)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                        Encerrada
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                                      style={{ background: av.bg, color: av.color }}>
                                      {getInitials(lead.contato_nome, lead.contato_telefone)}
                                    </div>
                                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                      {lead.contato_nome || lead.contato_telefone}
                                    </span>
                                  </div>
                                  {lead.resumo && (
                                    <p className="text-[11px] leading-relaxed mb-1.5 line-clamp-2"
                                      style={{ color: 'var(--text-secondary)' }}>
                                      {lead.resumo}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>
                                      {tempoRelativo(lead.atualizado_em)}
                                    </span>
                                    <span className="text-[10px]"
                                      style={{ color: lead.movido_por === 'agente' ? '#10B981' : '#818CF8' }}>
                                      {lead.movido_por === 'agente' ? '⬡ IA' : '◎ Humano'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          )
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {modalLead && (
        <CRMCardModal
          lead={modalLead}
          funilAtivo={funilAtivo}
          onClose={() => setModalLead(null)}
          onMover={async (novaEtapa: string) => {
            setModalLead(prev => prev ? { ...prev, etapa: novaEtapa } : prev)
            setLeads(prev => prev.map(l =>
              l.id === modalLead.id
                ? { ...l, etapa: novaEtapa, etapa_anterior: l.etapa, movido_por: 'humano' }
                : l
            ))
            await fetch('/api/crm', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: modalLead.id, etapa: novaEtapa, movido_por: 'humano' }),
            })
          }}
        />
      )}
    </div>
  )
}