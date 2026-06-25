'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare, Users, Clock, PauseCircle,
  ArrowUp, ArrowDown, Play, Pause, Phone,
  Filter, Download, FileText, ShieldAlert, MessageCircle, LogOut, ChevronDown,
  Bot, UserCheck, AlertCircle,
} from 'lucide-react'
import { exportPDF } from '@/lib/exportPDF'
import { LABELS_FUNIL } from '@/lib/crm'

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

interface CRMStats {
  funilAtivo: string
  etapas: string[]
  labels: Record<string, string>
  contagemEtapa: Record<string, number>
  resolvidosIA: number
  resolvidosHumano: number
  aguardandoHumano: number
  transferidosHumano: number
  periodo: number
  totalConversasPeriodo: number
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

interface InstanciaBanida {
  id: string
  instance_name: string
  apelido: string
}

interface DiaDado {
  dia: string
  total: number
}

interface AtividadeItem {
  id: string
  tipo: 'conversa' | 'log'
  texto: string
  cor: string
  criado_em: string
}

// ─── Paleta CRM ───────────────────────────────────────────────────────────────

const CRM_CORES = [
  '#10B981', // verde
  '#3B82F6', // azul
  '#8B5CF6', // roxo
  '#F59E0B', // âmbar
  '#06B6D4', // ciano
  '#EC4899', // rosa
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (d.length === 13) return `+${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
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
    `"${c.contato_nome||''}","${c.contato_telefone}","${c.ultima_mensagem}","${c.agente_pausado?'Pausado':'Ativo'}","${tempoRelativo(c.ultima_mensagem_em)}"`
  ).join('\n')
  const blob = new Blob([header+rows], {type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download='conversas.csv'; a.click()
  URL.revokeObjectURL(url)
}

function exportarConversasPDF(conversas: ConversaRecente[]) {
  exportPDF({
    titulo: 'Conversas Recentes',
    subtitulo: `Exportado em ${new Date().toLocaleString('pt-BR')}`,
    colunas: [
      {label:'Contato',key:'contato',align:'left'},{label:'Telefone',key:'telefone',align:'left'},
      {label:'Última mensagem',key:'msg',align:'left'},{label:'Status',key:'status',align:'left'},
      {label:'Hora',key:'hora',align:'left'},
    ],
    linhas: conversas.map(c => ({
      contato: c.contato_nome||'—', telefone: c.contato_telefone,
      msg: c.ultima_mensagem.slice(0,40)+(c.ultima_mensagem.length>40?'...':''),
      status: c.agente_pausado?'Pausado':'Ativo', hora: tempoRelativo(c.ultima_mensagem_em),
    })),
    nomeArquivo: `conversas_${new Date().toISOString().slice(0,10)}`,
  })
}

function exportarGraficoPDF(dados: DiaDado[], periodo: string) {
  exportPDF({
    titulo: `Volume de Conversas — últimos ${periodo} dias`,
    subtitulo: `Exportado em ${new Date().toLocaleString('pt-BR')}`,
    colunas: [{label:'Data',key:'data',align:'left'},{label:'Conversas',key:'total',align:'right'}],
    linhas: dados.map(d => ({
      data: new Date(d.dia+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}),
      total: d.total,
    })),
    totais: {data:'Total',total:dados.reduce((s,d)=>s+d.total,0)},
    nomeArquivo: `grafico_conversas_${periodo}d_${new Date().toISOString().slice(0,10)}`,
  })
}

// ─── Cache client-side 15 minutos ─────────────────────────────────────────────

const CRM_CACHE_TTL = 15 * 60 * 1000 // 15 min em ms

function getCRMCache(periodo: string): CRMStats | null {
  try {
    const raw = localStorage.getItem(`crm_stats_${periodo}`)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw) as { ts: number; data: CRMStats }
    if (Date.now() - ts > CRM_CACHE_TTL) { localStorage.removeItem(`crm_stats_${periodo}`); return null }
    return data
  } catch { return null }
}

function setCRMCache(periodo: string, data: CRMStats) {
  try { localStorage.setItem(`crm_stats_${periodo}`, JSON.stringify({ ts: Date.now(), data })) } catch { /* */ }
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function KpiCard({ label, valor, d, icon: Icon, cor, alt }: {
  label: string; valor: number; d: number | null; icon: React.ElementType; cor: string; alt?: boolean
}) {
  return (
    <div className="rounded-xl p-4 md:p-5" style={{ background: 'var(--bg-surface)', border: `1px solid ${alt ? 'rgba(245,158,11,0.2)' : 'var(--border)'}` }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs md:text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cor}18` }}>
          <Icon size={16} color={cor} />
        </div>
      </div>
      <p className="text-2xl md:text-3xl font-bold mb-2" style={{ color: alt ? '#F59E0B' : 'var(--text-primary)' }}>
        {valor.toLocaleString('pt-BR')}
      </p>
      {d != null ? (
        <span className={`flex items-center gap-0.5 text-xs font-medium ${d >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
          {d >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          {d >= 0 ? '+' : ''}{d}% vs. período anterior
        </span>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-label)' }}>sem dados anteriores</span>
      )}
    </div>
  )
}

// Card CRM — sem destaque de cor nas etapas finais (visual padrão para todos)
function CRMEtapaCard({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="rounded-xl p-3 md:p-4 flex flex-col gap-1.5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cor }} />
        <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {valor.toLocaleString('pt-BR')}
      </p>
    </div>
  )
}

// Insights CRM — responde ao período selecionado
function InsightsCRM({ stats, periodo }: { stats: CRMStats; periodo: string }) {
  const total = stats.resolvidosIA + stats.resolvidosHumano
  const pctIA     = total > 0 ? Math.round((stats.resolvidosIA / total) * 100) : 0
  const pctHumano = total > 0 ? 100 - pctIA : 0

  const insights = [
    stats.aguardandoHumano > 0 && {
      icone: AlertCircle, cor: '#F59E0B',
      texto: `${stats.aguardandoHumano} conversa${stats.aguardandoHumano !== 1 ? 's' : ''} aguardando atendente agora`,
    },
    stats.transferidosHumano > 0 && {
      icone: UserCheck, cor: '#3B82F6',
      texto: `${stats.transferidosHumano} transferência${stats.transferidosHumano !== 1 ? 's' : ''} para humano nos últimos ${periodo} dias`,
    },
    stats.resolvidosIA > 0 && {
      icone: Bot, cor: '#10B981',
      texto: `${stats.resolvidosIA} atendimento${stats.resolvidosIA !== 1 ? 's' : ''} concluído${stats.resolvidosIA !== 1 ? 's' : ''} pela IA`,
    },
    stats.resolvidosHumano > 0 && {
      icone: UserCheck, cor: '#8B5CF6',
      texto: `${stats.resolvidosHumano} atendimento${stats.resolvidosHumano !== 1 ? 's' : ''} concluído${stats.resolvidosHumano !== 1 ? 's' : ''} por humano`,
    },
    stats.totalConversasPeriodo > 0 && {
      icone: MessageSquare, cor: '#06B6D4',
      texto: `${stats.totalConversasPeriodo} nova${stats.totalConversasPeriodo !== 1 ? 's conversa iniciada' : ' conversa iniciada'}${stats.totalConversasPeriodo !== 1 ? 's' : ''} nos últimos ${periodo} dias`,
    },
  ].filter(Boolean) as Array<{ icone: React.ElementType; cor: string; texto: string }>

  return (
    <div className="rounded-xl p-4 md:p-5 flex flex-col gap-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div>
        <h2 className="font-semibold text-sm md:text-base" style={{ color: 'var(--text-primary)' }}>Insights do CRM</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Últimos {periodo} dias · Funil de {LABELS_FUNIL[stats.funilAtivo] ?? stats.funilAtivo}
        </p>
      </div>

      {/* Barra IA vs Humano */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1"><Bot size={11} color="#10B981" /> IA {pctIA}%</span>
            <span className="flex items-center gap-1"><UserCheck size={11} color="#8B5CF6" /> Humano {pctHumano}%</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-2)' }}>
            <div className="h-full" style={{ width: `${pctIA}%`, background: '#10B981' }} />
            <div className="h-full" style={{ width: `${pctHumano}%`, background: '#8B5CF6' }} />
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-label)' }}>
            {total} atendimento{total !== 1 ? 's' : ''} concluído{total !== 1 ? 's' : ''} no período
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {insights.length > 0 ? insights.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: `${item.cor}18` }}>
              <item.icone size={12} color={item.cor} />
            </div>
            <p className="text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>{item.texto}</p>
          </div>
        )) : (
          <p className="text-xs" style={{ color: 'var(--text-label)' }}>
            Nenhum dado disponível para os últimos {periodo} dias.
          </p>
        )}
      </div>
    </div>
  )
}

// Gráfico de barras — conversas por dia + gráfico de barras lado a lado por etapa CRM
function GraficoBarras({ dados, crmStats, onExport }: {
  dados: DiaDado[]
  crmStats: CRMStats | null
  onExport: () => void
}) {
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null)
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    function detectTheme() { setIsDark(document.documentElement.getAttribute('data-theme') !== 'light') }
    detectTheme()
    const obs = new MutationObserver(detectTheme)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const total = dados.reduce((s, d) => s + d.total, 0)
  const media = +(total / (dados.filter(d => d.total > 0).length || 1)).toFixed(1)
  const pico  = Math.max(...dados.map(d => d.total), 0)
  const yMax  = Math.max(pico + 1, 5)

  const W = 800, H = 200
  const padL = 32, padR = 8, padT = 28, padB = 32
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const barW = Math.max(2, (innerW / Math.max(dados.length,1)) * 0.6)
  const gap   = innerW / Math.max(dados.length, 1)
  const yTicks = [0, Math.round(yMax * 0.5), yMax]
  const step = Math.max(1, Math.floor(dados.length / 8))
  const xLabelIdxs = new Set(dados.map((_,i) => i).filter(i => i===0||i===dados.length-1||i%step===0))

  function barHeight(val: number) { return (val / yMax) * innerH }
  function barX(i: number) { return padL + i * gap + gap / 2 }
  function fmtDia(dia: string) {
    const d = new Date(dia + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
  }

  const textColor     = isDark ? '#6B6B6B' : '#71717A'
  const gridColor     = isDark ? '#1F1F1F' : '#D4D4D8'
  const labelColor    = isDark ? '#A3A3A3' : '#3F3F46'
  const tooltipBg     = isDark ? '#111111' : '#FFFFFF'
  const tooltipBorder = isDark ? '#2A2A2A' : '#D4D4D8'
  const tooltipText   = isDark ? '#FFFFFF' : '#09090B'

  // Etapas para o mini gráfico de barras laterais (todas, incluindo finais)
  const etapasGrafico = crmStats
    ? crmStats.etapas.map((e, idx) => ({
        label: crmStats.labels[e] ?? e,
        valor: crmStats.contagemEtapa[e] ?? 0,
        cor: CRM_CORES[idx % CRM_CORES.length],
      }))
    : []

  const maxEtapa = Math.max(...etapasGrafico.map(e => e.valor), 1)

  if (dados.length === 0) return (
    <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-label)' }}>
      Nenhum dado no período
    </div>
  )

  return (
    <div>
      {/* Stats + botão PDF */}
      <div className="flex items-center gap-6 md:gap-10 mb-4 flex-wrap">
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Total</p>
          <p className="text-lg font-bold text-[#10B981]">{total.toLocaleString('pt-BR')}</p>
        </div>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Média/dia ativo</p>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{media}</p>
        </div>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Pico</p>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{pico}</p>
        </div>
        <button onClick={onExport}
          className="ml-auto flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5"
          style={{ color:'var(--text-muted)', border:'1px solid var(--border)', background:'var(--bg-surface-2)' }}>
          <Download size={12} /> PDF
        </button>
      </div>

      {/* Gráfico de linha do tempo */}
      <div style={{ position:'relative', width:'100%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
          style={{ display:'block', overflow:'visible' }}
          onMouseLeave={() => setTooltip(null)}>
          {yTicks.map(tick => {
            const y = padT + innerH - (tick/yMax)*innerH
            return (
              <g key={tick}>
                <line x1={padL} y1={y} x2={padL+innerW} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray="3,3" />
                <text x={padL-4} y={y+4} textAnchor="end" fontSize="10" fill={textColor}>{tick}</text>
              </g>
            )
          })}
          <line x1={padL} y1={padT+innerH} x2={padL+innerW} y2={padT+innerH} stroke={gridColor} strokeWidth="1" />
          {dados.map((d, i) => {
            const x = barX(i)
            const h = Math.max(barHeight(d.total), d.total>0?3:0)
            const y = padT + innerH - h
            const isHover = tooltip?.i === i
            return (
              <g key={i}>
                <rect x={x-barW/2} y={y} width={barW} height={h} fill="#10B981" opacity={isHover?1:0.85} rx="3" />
                {d.total > 0 && (
                  <text x={x} y={y-4} textAnchor="middle" fontSize="10" fontWeight="600" fill={labelColor}>{d.total}</text>
                )}
                <rect x={x-gap/2} y={padT} width={gap} height={innerH} fill="transparent"
                  style={{ cursor:'crosshair' }} onMouseEnter={() => setTooltip({i, x, y})} />
              </g>
            )
          })}
          {dados.map((d, i) => {
            if (!xLabelIdxs.has(i)) return null
            return (
              <text key={i} x={barX(i)} y={padT+innerH+18} textAnchor="middle" fontSize="10" fill={textColor}>
                {fmtDia(d.dia)}
              </text>
            )
          })}
          {tooltip && (() => {
            const d = dados[tooltip.i]
            const tx = Math.min(Math.max(barX(tooltip.i), padL+36), W-padR-36)
            const ty = Math.max(tooltip.y-10, padT+2)
            return (
              <g>
                <rect x={tx-38} y={ty-14} width={76} height={20} rx="4" fill={tooltipBg} stroke={tooltipBorder} strokeWidth="1" />
                <text x={tx} y={ty+2} textAnchor="middle" fontSize="10" fontWeight="600" fill={tooltipText}>
                  {fmtDia(d.dia)}: {d.total} conv.
                </text>
              </g>
            )
          })()}
        </svg>
      </div>

      {/* Distribuição do funil — barras horizontais elegantes */}
      {etapasGrafico.length > 0 && (
        <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-label)' }}>
            Distribuição atual · Funil de {LABELS_FUNIL[crmStats!.funilAtivo] ?? crmStats!.funilAtivo}
          </p>
          <div className="space-y-2">
            {etapasGrafico.map((e, i) => {
              const pct = maxEtapa > 0 ? Math.max((e.valor / maxEtapa) * 100, e.valor > 0 ? 3 : 0) : 0
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[11px] flex-shrink-0 text-right truncate"
                    style={{ width: 110, color: 'var(--text-secondary)' }}>
                    {e.label}
                  </span>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: 'var(--bg-surface-2)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: e.cor, opacity: e.valor > 0 ? 1 : 0, minWidth: e.valor > 0 ? 6 : 0 }} />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums flex-shrink-0"
                    style={{ width: 18, textAlign: 'right', color: e.valor > 0 ? e.cor : 'var(--text-label)' }}>
                    {e.valor}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function logParaAtividade(log: { id: string; acao: string; descricao: string; criado_em: string }): AtividadeItem {
  const corMap: Record<string, string> = {
    pausou_ia:'#F59E0B', retomou_ia:'#10B981', enviou_mensagem:'#818CF8', enviou_midia:'#818CF8',
  }
  return { id:`log_${log.id}`, tipo:'log', texto:log.descricao, cor:corMap[log.acao]??'var(--text-muted)', criado_em:log.criado_em }
}

const CONV_LIMIT_STEP = 20

// ─── Página principal ─────────────────────────────────────────────────────────

export default function VisaoGeralPage() {
  const [metrics, setMetrics]               = useState<Metrics | null>(null)
  const [crmStats, setCrmStats]             = useState<CRMStats | null>(null)
  const [crmCarregando, setCrmCarregando]   = useState(false)
  const [conversas, setConversas]           = useState<ConversaRecente[]>([])
  const [conversasFiltradas, setConversasFiltradas] = useState<ConversaRecente[]>([])
  const [grafico, setGrafico]               = useState<DiaDado[]>([])
  const [periodo, setPeriodo]               = useState<'7' | '30' | '90'>('30')
  const [filtroStatus, setFiltroStatus]     = useState<'todos' | 'ativo' | 'pausado'>('todos')
  const [carregando, setCarregando]         = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [convLimit, setConvLimit]           = useState(CONV_LIMIT_STEP)
  const [nomeUsuario, setNomeUsuario]       = useState('')
  const [tenantId, setTenantId]             = useState<string | null>(null)
  const [pausando, setPausando]             = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [instanciasBanidas, setInstanciasBanidas] = useState<InstanciaBanida[]>([])
  const [desconectando, setDesconectando]   = useState<Record<string, boolean>>({})
  const [confirmDesconectar, setConfirmDesconectar] = useState<string | null>(null)
  const [atividades, setAtividades]         = useState<AtividadeItem[]>([])
  const exportRef = useRef<HTMLDivElement>(null)
  const graficoCache = useRef<Partial<Record<'7'|'30'|'90', DiaDado[]>>>({})

  useEffect(() => {
    function h(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportModal(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Busca CRM stats com cache localStorage 15min
  const fetchCRMStats = useCallback(async (p: string) => {
    // Cache só para o período 30 (carga inicial) — insights mudam por período
    const cached = p === '30' ? getCRMCache(p) : null
    if (cached) { setCrmStats(cached); return }
    setCrmCarregando(true)
    try {
      const res = await fetch(`/api/visao-geral/crm-stats?periodo=${p}`)
      if (res.ok) {
        const data = await res.json() as CRMStats
        // Salva cache só para 30d
        if (p === '30') setCRMCache(p, data)
        setCrmStats(data)
      }
    } catch { /* não crítico */ } finally {
      setCrmCarregando(false)
    }
  }, [])

  useEffect(() => {
    async function fetchInicial() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('nome, tenant_id, role').eq('id', user.id).single()
      if (!userData?.tenant_id) return

      setNomeUsuario(userData.nome?.split(' ')[0] ?? '')
      setTenantId(userData.tenant_id)
      const tid = userData.tenant_id

      const agora     = new Date()
      const hoje      = new Date(agora); hoje.setHours(0,0,0,0)
      const ontem     = new Date(hoje);  ontem.setDate(ontem.getDate()-1)
      const semana    = new Date(agora); semana.setDate(semana.getDate()-7)
      const semAnt    = new Date(agora); semAnt.setDate(semAnt.getDate()-14)
      const mes30     = new Date(agora); mes30.setDate(mes30.getDate()-30)
      const mes60     = new Date(agora); mes60.setDate(mes60.getDate()-60)

      const [hojeOntemRes, semanaRes, semAntRes, mesRes, mesAntRes, pausadasRes, convRes, bandasRes] =
        await Promise.all([
          supabase.from('conversations').select('ultima_mensagem_em',{count:'exact'}).eq('tenant_id',tid).gte('ultima_mensagem_em',ontem.toISOString()).limit(10000),
          supabase.from('conversations').select('id',{count:'exact',head:true}).eq('tenant_id',tid).gte('ultima_mensagem_em',semana.toISOString()),
          supabase.from('conversations').select('id',{count:'exact',head:true}).eq('tenant_id',tid).gte('ultima_mensagem_em',semAnt.toISOString()).lt('ultima_mensagem_em',semana.toISOString()),
          supabase.from('conversations').select('id',{count:'exact',head:true}).eq('tenant_id',tid).gte('ultima_mensagem_em',mes30.toISOString()),
          supabase.from('conversations').select('id',{count:'exact',head:true}).eq('tenant_id',tid).gte('ultima_mensagem_em',mes60.toISOString()).lt('ultima_mensagem_em',mes30.toISOString()),
          supabase.from('conversations').select('pausado_em').eq('tenant_id',tid).eq('agente_pausado',true).limit(10000),
          supabase.from('conversations').select(`id,contato_nome,contato_telefone,status,agente_pausado,ultima_mensagem_em,messages(conteudo,criado_em)`).eq('tenant_id',tid).eq('status','ativa').order('ultima_mensagem_em',{ascending:false}).limit(CONV_LIMIT_STEP),
          supabase.from('tenant_instances').select('id,instance_name,apelido').eq('tenant_id',tid).eq('status','banido'),
        ])

      const hojeIsoStr    = hoje.toISOString()
      const convHojeOntem = hojeOntemRes.data ?? []
      const convHoje      = convHojeOntem.filter(c => (c.ultima_mensagem_em ?? '') >= hojeIsoStr).length
      const convOntem     = convHojeOntem.filter(c => (c.ultima_mensagem_em ?? '') < hojeIsoStr).length
      const pausadasData  = pausadasRes.data ?? []
      const totalPausadas = pausadasData.length
      const pausadasAnt   = pausadasData.filter(c => c.pausado_em && c.pausado_em < hojeIsoStr).length

      setMetrics({
        conversasHoje:convHoje, conversasHojeAnterior:convOntem,
        conversasSemana:semanaRes.count??0, conversasSemanaAnterior:semAntRes.count??0,
        conversasMes:mesRes.count??0, conversasMesAnterior:mesAntRes.count??0,
        pausadas:totalPausadas, pausadasAnterior:pausadasAnt,
      })
      setInstanciasBanidas((bandasRes.data??[]) as InstanciaBanida[])

      type ConvRaw = { id:string;contato_nome:string;contato_telefone:string;status:string;agente_pausado:boolean;ultima_mensagem_em:string;messages:Array<{conteudo:string;criado_em:string}> }
      const convComMsg: ConversaRecente[] = ((convRes.data??[]) as unknown as ConvRaw[]).map(c => {
        const msgs = (c.messages??[]).sort((a,b) => new Date(b.criado_em).getTime()-new Date(a.criado_em).getTime())
        return { ...c, ultima_mensagem: msgs[0]?.conteudo??'—' }
      })
      setConversas(convComMsg)
      setConversasFiltradas(convComMsg)
      setConvLimit(CONV_LIMIT_STEP)

      const itensConversas: AtividadeItem[] = convComMsg.slice(0,4).map(c => ({
        id:`conv_${c.id}`, tipo:'conversa' as const,
        texto:`${c.contato_nome||c.contato_telefone} ${c.agente_pausado?'solicitou atendimento humano.':'está em conversa com o agente.'}`,
        cor: c.agente_pausado?'#F59E0B':'#10B981', criado_em:c.ultima_mensagem_em,
      }))
      let itensLogs: AtividadeItem[] = []
      if (['admin_hubtek','admin_tenant','self_managed'].includes(userData.role)) {
        const { data:logsData } = await supabase.from('conversation_logs').select('id,acao,descricao,criado_em').eq('tenant_id',tid).order('criado_em',{ascending:false}).limit(6)
        itensLogs = (logsData??[]).map(logParaAtividade)
      }
      const todos = [...itensConversas,...itensLogs].sort((a,b)=>new Date(b.criado_em).getTime()-new Date(a.criado_em).getTime()).slice(0,8)
      setAtividades(todos)
      setCarregando(false)
    }
    fetchInicial()
  }, [])

  // CRM stats — atualiza quando período muda
  useEffect(() => { fetchCRMStats(periodo) }, [periodo, fetchCRMStats])

  const fetchGrafico = useCallback(async (p: '7'|'30'|'90') => {
    if (graficoCache.current[p]) { setGrafico(graficoCache.current[p]!); return }
    const supabase = createClient()
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) return
    const { data:userData } = await supabase.from('users').select('tenant_id').eq('id',user.id).single()
    if (!userData?.tenant_id) return
    const dias = parseInt(p)
    const inicio = new Date(); inicio.setDate(inicio.getDate()-dias); inicio.setHours(0,0,0,0)
    const { data } = await supabase.from('conversations').select('ultima_mensagem_em').eq('tenant_id',userData.tenant_id).gte('ultima_mensagem_em',inicio.toISOString())
    const porDia: Record<string,number> = {}
    const curr = new Date(inicio)
    const hoje = new Date(); hoje.setHours(23,59,59,999)
    while (curr<=hoje) { porDia[curr.toISOString().slice(0,10)]=0; curr.setDate(curr.getDate()+1) }
    ;(data??[]).forEach(c => { const dia=(c.ultima_mensagem_em??'').slice(0,10); if (porDia[dia]!==undefined) porDia[dia]++ })
    const resultado = Object.entries(porDia).map(([dia,total])=>({dia,total}))
    graficoCache.current[p] = resultado
    setGrafico(resultado)
  }, [])

  useEffect(() => { fetchGrafico(periodo) }, [periodo, fetchGrafico])

  const handleCarregarMais = useCallback(async () => {
    if (!tenantId) return
    setCarregandoMais(true)
    const novoLimit = convLimit + CONV_LIMIT_STEP
    const supabase = createClient()
    type ConvRaw = { id:string;contato_nome:string;contato_telefone:string;status:string;agente_pausado:boolean;ultima_mensagem_em:string;messages:Array<{conteudo:string;criado_em:string}> }
    const { data } = await supabase.from('conversations').select(`id,contato_nome,contato_telefone,status,agente_pausado,ultima_mensagem_em,messages(conteudo,criado_em)`).eq('tenant_id',tenantId).eq('status','ativa').order('ultima_mensagem_em',{ascending:false}).limit(novoLimit)
    const convComMsg: ConversaRecente[] = ((data??[]) as unknown as ConvRaw[]).map(c => {
      const msgs = (c.messages??[]).sort((a,b)=>new Date(b.criado_em).getTime()-new Date(a.criado_em).getTime())
      return { ...c, ultima_mensagem:msgs[0]?.conteudo??'—' }
    })
    setConversas(convComMsg); setConvLimit(novoLimit); setCarregandoMais(false)
  }, [tenantId, convLimit])

  useEffect(() => {
    if (filtroStatus==='todos') setConversasFiltradas(conversas)
    else if (filtroStatus==='ativo') setConversasFiltradas(conversas.filter(c=>!c.agente_pausado))
    else setConversasFiltradas(conversas.filter(c=>c.agente_pausado))
  }, [filtroStatus, conversas])

  async function handlePausarRetomar(conversa: ConversaRecente) {
    setPausando(conversa.id)
    const supabase = createClient()
    const novoPausado = !conversa.agente_pausado
    await supabase.from('conversations').update({ agente_pausado:novoPausado, pausado_em:novoPausado?new Date().toISOString():null }).eq('id',conversa.id)
    setConversas(prev => prev.map(c => c.id===conversa.id?{...c,agente_pausado:novoPausado}:c))
    const { data:{ session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      const { data:ud } = await supabase.from('users').select('nome,tenant_id').eq('id',session.user.id).single()
      await fetch('/api/conversas/registrar-log', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
        body: JSON.stringify({ conversation_id:conversa.id, tenant_id:ud?.tenant_id, acao:novoPausado?'pausou_ia':'retomou_ia', contato_nome:conversa.contato_nome||conversa.contato_telefone, operador_nome:ud?.nome }),
      })
    }
    setPausando(null)
  }

  async function handleDesconectar(instanceName: string) {
    setDesconectando(prev=>({...prev,[instanceName]:true}))
    setConfirmDesconectar(null)
    try {
      const res = await fetch('/api/whatsapp/desconectar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instance_name:instanceName})})
      if (res.ok) setInstanciasBanidas(prev=>prev.filter(i=>i.instance_name!==instanceName))
    } finally { setDesconectando(prev=>({...prev,[instanceName]:false})) }
  }

  const temMaisConversas = conversas.length >= convLimit

  if (carregando) {
    return (
      <div className="p-4 md:p-8">
        <div className="h-8 rounded w-48 mb-2 animate-pulse" style={{ background:'var(--bg-surface)' }} />
        <div className="h-4 rounded w-72 mb-6 animate-pulse" style={{ background:'var(--bg-surface)' }} />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
          {[...Array(6)].map((_,i)=>(<div key={i} className="h-20 rounded-xl animate-pulse" style={{background:'var(--bg-surface)',border:'1px solid var(--border)'}} />))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[...Array(4)].map((_,i)=>(<div key={i} className="h-28 rounded-xl animate-pulse" style={{background:'var(--bg-surface)',border:'1px solid var(--border)'}} />))}
        </div>
        <div className="h-64 rounded-xl animate-pulse" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>{saudacao()}, {nomeUsuario}</p>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color:'var(--text-primary)' }}>Visão Geral</h1>
          <p className="text-xs md:text-sm mt-0.5 hidden sm:block" style={{ color:'var(--text-secondary)' }}>
            Como seu agente performou nos últimos {periodo} dias.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg p-1 shrink-0" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
          {(['7','30','90'] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className="px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ background:periodo===p?'#10B981':'transparent', color:periodo===p?'#fff':'var(--text-muted)' }}>
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* Alerta instâncias banidas */}
      {instanciasBanidas.length > 0 && (
        <div className="rounded-xl p-4 space-y-3" style={{ background:'#EF444408', border:'1px solid #EF444430' }}>
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-400">
              {instanciasBanidas.length===1?'Número banido pelo WhatsApp':`${instanciasBanidas.length} números banidos`}
            </p>
          </div>
          <div className="space-y-2">
            {instanciasBanidas.map(inst => {
              const estaDesconectando = desconectando[inst.instance_name]??false
              const pedindoConfirm    = confirmDesconectar===inst.instance_name
              return (
                <div key={inst.id} className="rounded-lg p-3" style={{ background:'#EF444410', border:'1px solid #EF444425' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldAlert size={13} className="text-red-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-red-400">{inst.apelido}</span>
                        <span className="text-xs font-mono ml-2 hidden sm:inline" style={{ color:'var(--text-muted)' }}>{inst.instance_name}</span>
                      </div>
                    </div>
                    {!pedindoConfirm ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => setConfirmDesconectar(inst.instance_name)}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                          style={{ background:'var(--bg-surface)', border:'1px solid #EF444440', color:'#EF4444' }}>
                          <LogOut size={12} /> Desconectar
                        </button>
                        <a href="https://wa.me/5551980104924" target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                          style={{ background:'#10B98115', border:'1px solid #10B98130', color:'#10B981' }}>
                          <MessageCircle size={12} /> Suporte
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => setConfirmDesconectar(null)}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                          style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', color:'var(--text-secondary)' }}>
                          Cancelar
                        </button>
                        <button onClick={() => handleDesconectar(inst.instance_name)} disabled={estaDesconectando}
                          className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">
                          <LogOut size={11} className={estaDesconectando?'animate-spin':''} />
                          {estaDesconectando?'Aguarde...':'Confirmar'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── BLOCO CRM ──────────────────────────────────────────────────────── */}
      {crmStats && crmStats.etapas.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--text-label)' }}>
              CRM · Funil de {LABELS_FUNIL[crmStats.funilAtivo] ?? crmStats.funilAtivo}
            </p>
            <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
            {crmCarregando && <span className="text-[10px]" style={{ color:'var(--text-label)' }}>atualizando...</span>}
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns:`repeat(${crmStats.etapas.length},minmax(0,1fr))` }}>
            {crmStats.etapas.map((etapa, idx) => (
              <CRMEtapaCard
                key={etapa}
                label={crmStats.labels[etapa] ?? etapa}
                valor={crmStats.contagemEtapa[etapa] ?? 0}
                cor={CRM_CORES[idx % CRM_CORES.length]}
              />
            ))}
          </div>
        </div>
      )}
      {!crmStats && crmCarregando && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {[...Array(5)].map((_,i)=>(<div key={i} className="h-20 rounded-xl animate-pulse" style={{background:'var(--bg-surface)',border:'1px solid var(--border)'}} />))}
        </div>
      )}

      {/* Separador com label */}
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider flex-shrink-0" style={{ color:'var(--text-label)' }}>
          Novas conversas abertas
        </p>
        <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
      </div>

      {/* ── KPIs de conversas ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Hoje"      valor={metrics!.conversasHoje}   d={delta(metrics!.conversasHoje,metrics!.conversasHojeAnterior)}     icon={MessageSquare} cor="#10B981" />
        <KpiCard label="Na semana" valor={metrics!.conversasSemana} d={delta(metrics!.conversasSemana,metrics!.conversasSemanaAnterior)} icon={Clock}         cor="#3B82F6" />
        <KpiCard label="No mês"    valor={metrics!.conversasMes}    d={delta(metrics!.conversasMes,metrics!.conversasMesAnterior)}       icon={Users}         cor="#8B5CF6" />
        <KpiCard label="Pausadas"  valor={metrics!.pausadas}        d={delta(metrics!.pausadas,metrics!.pausadasAnterior)}               icon={PauseCircle}   cor="#F59E0B" alt />
      </div>

      {/* ── Gráfico + coluna direita ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl p-4 md:p-6" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
          <div className="mb-4">
            <h2 className="font-semibold text-sm md:text-base" style={{ color:'var(--text-primary)' }}>
              Volume de conversas — {periodo} dias
            </h2>
            <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>Total agregado por dia.</p>
          </div>
          <GraficoBarras dados={grafico} crmStats={crmStats} onExport={() => exportarGraficoPDF(grafico, periodo)} />
        </div>

        <div className="space-y-4">
          {crmStats && <InsightsCRM stats={crmStats} periodo={periodo} />}

          <div className="rounded-xl p-4 md:p-5" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
            <h2 className="font-semibold mb-1 text-sm" style={{ color:'var(--text-primary)' }}>Atividade recente</h2>
            <p className="text-xs mb-3" style={{ color:'var(--text-muted)' }}>Eventos do agente e ações dos operadores.</p>
            <div className="space-y-2.5">
              {atividades.map(item => (
                <div key={item.id} className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background:item.cor }} />
                  <div className="min-w-0">
                    <p className="text-xs leading-snug" style={{ color:'var(--text-primary)' }}>{item.texto}</p>
                    <p className="text-xs mt-0.5" style={{ color:'var(--text-label)' }}>{tempoRelativo(item.criado_em)}</p>
                  </div>
                </div>
              ))}
              {atividades.length===0 && (
                <p className="text-sm" style={{ color:'var(--text-label)' }}>Nenhuma atividade recente.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Conversas recentes ────────────────────────────────────────────── */}
      <div className="rounded-xl" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 gap-3 flex-wrap" style={{ borderBottom:'1px solid var(--border)' }}>
          <div>
            <h2 className="font-semibold text-sm md:text-base" style={{ color:'var(--text-primary)' }}>Conversas recentes</h2>
            <p className="text-xs mt-0.5 hidden sm:block" style={{ color:'var(--text-muted)' }}>
              {conversasFiltradas.length} conversa{conversasFiltradas.length!==1?'s':''} ativa{conversasFiltradas.length!==1?'s':''}.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background:'var(--bg-surface-2)', border:'1px solid var(--border)' }}>
              {([['todos','Todos'],['ativo','Ativos'],['pausado','Pausados']] as const).map(([val,label]) => (
                <button key={val} onClick={() => setFiltroStatus(val)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors"
                  style={{ background:filtroStatus===val?'var(--bg-hover)':'transparent', color:filtroStatus===val?'var(--text-primary)':'var(--text-muted)' }}>
                  <Filter size={10} />{label}
                </button>
              ))}
            </div>
            <div className="relative" ref={exportRef}>
              <button onClick={() => setShowExportModal(prev=>!prev)}
                className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-2"
                style={{ color:'var(--text-muted)', border:'1px solid var(--border)' }}>
                <Download size={12} /> Exportar
              </button>
              {showExportModal && (
                <div className="absolute right-0 top-9 w-36 rounded-xl shadow-xl z-50 overflow-hidden"
                  style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
                  <button onClick={() => { exportarCSV(conversasFiltradas); setShowExportModal(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs" style={{ color:'var(--text-secondary)' }}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                    <Download size={12} /> CSV
                  </button>
                  <button onClick={() => { exportarConversasPDF(conversasFiltradas); setShowExportModal(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs" style={{ color:'var(--text-secondary)' }}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                    <FileText size={12} /> PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {conversasFiltradas.length===0 ? (
          <div className="p-12 text-center">
            <MessageSquare size={24} className="mx-auto mb-2" style={{ color:'var(--text-label)' }} />
            <p className="text-sm" style={{ color:'var(--text-muted)' }}>Nenhuma conversa encontrada.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Contato','Telefone','Última mensagem','Status','Hora','Ações'].map(h => (
                      <th key={h} className="text-left text-xs font-medium px-6 py-3 uppercase tracking-wider" style={{ color:'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conversasFiltradas.map(c => (
                    <tr key={c.id} className="transition-colors last:border-0" style={{ borderBottom:'1px solid var(--border)' }}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                            style={{ background:'var(--bg-hover)', color:'var(--text-secondary)' }}>
                            {(c.contato_nome||c.contato_telefone).slice(0,2).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{c.contato_nome||'—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-sm" style={{ color:'var(--text-secondary)' }}>
                          <Phone size={12} />{formatFone(c.contato_telefone)}
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-sm truncate" style={{ color:'var(--text-secondary)' }}>{c.ultima_mensagem}</p>
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
                        <span className="text-sm" style={{ color:'var(--text-muted)' }}>{tempoRelativo(c.ultima_mensagem_em)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <button onClick={() => handlePausarRetomar(c)} disabled={pausando===c.id}
                          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${c.agente_pausado?'bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 border border-[#10B981]/30':'bg-[#F59E0B]/10 text-[#F59E0B] hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30'}`}>
                          {c.agente_pausado?<><Play size={11} /> Retomar</>:<><Pause size={11} /> Pausar</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y" style={{ borderColor:'var(--border)' }}>
              {conversasFiltradas.map(c => (
                <div key={c.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{ background:'var(--bg-hover)', color:'var(--text-secondary)' }}>
                        {(c.contato_nome||c.contato_telefone).slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{c.contato_nome||'—'}</p>
                        <p className="text-xs" style={{ color:'var(--text-muted)' }}>{formatFone(c.contato_telefone)}</p>
                      </div>
                    </div>
                    {c.agente_pausado ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B]">Pausado</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981]">Ativo</span>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color:'var(--text-secondary)' }}>{c.ultima_mensagem}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color:'var(--text-muted)' }}>{tempoRelativo(c.ultima_mensagem_em)}</span>
                    <button onClick={() => handlePausarRetomar(c)} disabled={pausando===c.id}
                      className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${c.agente_pausado?'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30':'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30'}`}>
                      {c.agente_pausado?<><Play size={10} /> Retomar</>:<><Pause size={10} /> Pausar</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {temMaisConversas && (
              <div className="flex justify-center px-4 py-3" style={{ borderTop:'1px solid var(--border)' }}>
                <button onClick={handleCarregarMais} disabled={carregandoMais}
                  className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ border:'1px solid var(--border)', background:'var(--bg-surface-2)', color:'var(--text-secondary)' }}>
                  <ChevronDown size={14} className={carregandoMais?'animate-bounce':''} />
                  {carregandoMais?'Carregando...':'Ver mais conversas'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}