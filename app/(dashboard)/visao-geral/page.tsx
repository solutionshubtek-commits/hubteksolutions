'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare, Users, PauseCircle,
  ArrowUp, ArrowDown, Play, Pause, Phone,
  Filter, Download, FileText, ShieldAlert, MessageCircle, LogOut, ChevronDown,
  Bot, UserCheck, AlertCircle, CheckCircle2, Calendar, X, Smartphone,
} from 'lucide-react'
import { exportPDF } from '@/lib/exportPDF'
import { LABELS_FUNIL } from '@/lib/crm'

// ─── Tipos ────────────────────────────────────────────────────────────────────

// Todas as métricas seguem o período selecionado (Hoje/7d/30d/90d),
// com o valor "Anterior" referente ao período imediatamente anterior de
// mesmo tamanho — usado para o indicador de variação.
interface Metrics {
  conversas: number;   conversasAnterior: number
  novas: number;       novasAnterior: number
  escaladas: number;   escaladasAnterior: number
  concluidas: number;  concluidasAnterior: number
}

type Periodo = '1' | '7' | '30' | '90'

// Rótulos do período para textos da tela.
function periodoCurto(p: Periodo): string {
  return p === '1' ? 'Hoje' : `${p} dias`
}
function periodoFrase(p: Periodo): string {
  return p === '1' ? 'hoje' : `nos últimos ${p} dias`
}

// Janela atual e a imediatamente anterior (mesmo tamanho) para os cards do
// período. "Hoje" = dia vigente (00:00 → agora); anterior = ontem. Demais =
// janela móvel de N dias; anterior = os N dias antes dela.
function janelaPeriodo(p: Periodo): {
  inicioAtual: string; fimAtual: string; inicioAnterior: string; fimAnterior: string
} {
  const agora = new Date()
  if (p === '1') {
    const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0)
    const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1)
    return {
      inicioAtual: hoje.toISOString(), fimAtual: agora.toISOString(),
      inicioAnterior: ontem.toISOString(), fimAnterior: hoje.toISOString(),
    }
  }
  const dias = parseInt(p)
  const inicioAtual = new Date(agora.getTime() - dias * 86400000)
  const inicioAnterior = new Date(agora.getTime() - 2 * dias * 86400000)
  return {
    inicioAtual: inicioAtual.toISOString(), fimAtual: agora.toISOString(),
    inicioAnterior: inicioAnterior.toISOString(), fimAnterior: inicioAtual.toISOString(),
  }
}

// Janela de um intervalo customizado (datas YYYY-MM-DD, inclusivas). O período
// "anterior" tem o mesmo tamanho, imediatamente antes do início.
function janelaCustom(inicioStr: string, fimStr: string): {
  inicioAtual: string; fimAtual: string; inicioAnterior: string; fimAnterior: string
} {
  const ini = new Date(`${inicioStr}T00:00:00`)
  const fim = new Date(`${fimStr}T23:59:59.999`)
  const durMs = fim.getTime() - ini.getTime()
  const iniAnt = new Date(ini.getTime() - durMs - 1)
  return {
    inicioAtual: ini.toISOString(), fimAtual: fim.toISOString(),
    inicioAnterior: iniAnt.toISOString(), fimAnterior: new Date(ini.getTime() - 1).toISOString(),
  }
}

// Data YYYY-MM-DD → dd/mm/aaaa (meio-dia evita salto de fuso).
function fmtDataBR(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Seleção ativa: preset (Hoje/7/30/90) OU intervalo customizado.
type Selecao = { custom: { inicio: string; fim: string } | null; periodo: Periodo }

function janelaDaSelecao(sel: Selecao) {
  return sel.custom ? janelaCustom(sel.custom.inicio, sel.custom.fim) : janelaPeriodo(sel.periodo)
}
// Título curto e frase da seleção para os textos da tela.
function tituloSelecao(sel: Selecao): string {
  return sel.custom ? `${fmtDataBR(sel.custom.inicio)} – ${fmtDataBR(sel.custom.fim)}` : periodoCurto(sel.periodo)
}
function fraseSelecao(sel: Selecao): string {
  return sel.custom ? `no período de ${fmtDataBR(sel.custom.inicio)} a ${fmtDataBR(sel.custom.fim)}` : periodoFrase(sel.periodo)
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

interface InstanciaProblema {
  id: string
  instance_name: string
  apelido: string
  status: string
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

type FiltroStatus = 'todos' | 'ativo' | 'pausado' | 'encerrado'

// O banco tem as duas grafias por histórico — ver STATUS_ENCERRADOS em
// lib/supabase/queries/conversations.ts.
function estaEncerrada(c: ConversaRecente) {
  return c.status === 'encerrada' || c.status === 'encerrado'
}

function rotuloStatus(c: ConversaRecente) {
  if (estaEncerrada(c)) return 'Encerrada'
  return c.agente_pausado ? 'Pausado' : 'Ativo'
}

// Cor do badge de status, reaproveitada pelas versões desktop e mobile.
const CORES_STATUS: Record<string, string> = {
  Ativo:     '#10B981',
  Pausado:   '#F59E0B',
  Encerrada: '#6B7280',
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
    `"${c.contato_nome||''}","${c.contato_telefone}","${c.ultima_mensagem}","${rotuloStatus(c)}","${tempoRelativo(c.ultima_mensagem_em)}"`
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
      status: rotuloStatus(c), hora: tempoRelativo(c.ultima_mensagem_em),
    })),
    nomeArquivo: `conversas_${new Date().toISOString().slice(0,10)}`,
  })
}

function exportarGraficoPDF(dados: DiaDado[], titulo: string, porHora: boolean) {
  exportPDF({
    titulo: `Volume de Conversas — ${titulo}`,
    subtitulo: `Exportado em ${new Date().toLocaleString('pt-BR')}`,
    colunas: [{label:porHora?'Hora':'Data',key:'data',align:'left'},{label:'Conversas',key:'total',align:'right'}],
    linhas: dados.map(d => ({
      data: porHora
        ? `${String(new Date(d.dia).getHours()).padStart(2,'0')}h`
        : new Date(d.dia+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}),
      total: d.total,
    })),
    totais: {data:'Total',total:dados.reduce((s,d)=>s+d.total,0)},
    nomeArquivo: `grafico_conversas_${new Date().toISOString().slice(0,10)}`,
  })
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
function InsightsCRM({ stats, titulo, frase }: { stats: CRMStats; titulo: string; frase: string }) {
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
      texto: `${stats.transferidosHumano} transferência${stats.transferidosHumano !== 1 ? 's' : ''} para humano ${frase}`,
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
      texto: `${stats.totalConversasPeriodo} nova${stats.totalConversasPeriodo !== 1 ? 's conversa iniciada' : ' conversa iniciada'}${stats.totalConversasPeriodo !== 1 ? 's' : ''} ${frase}`,
    },
  ].filter(Boolean) as Array<{ icone: React.ElementType; cor: string; texto: string }>

  return (
    <div className="rounded-xl p-4 md:p-5 flex flex-col gap-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div>
        <h2 className="font-semibold text-sm md:text-base" style={{ color: 'var(--text-primary)' }}>Insights do CRM</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {titulo} · Funil de {LABELS_FUNIL[stats.funilAtivo] ?? stats.funilAtivo}
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
            Nenhum dado disponível {frase}.
          </p>
        )}
      </div>
    </div>
  )
}

// Gráfico de barras — conversas por dia + gráfico de barras lado a lado por etapa CRM
function GraficoBarras({ dados, crmStats, granularidade, onExport }: {
  dados: DiaDado[]
  crmStats: CRMStats | null
  granularidade: 'dia' | 'hora'
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
    if (granularidade === 'hora') {
      const d = new Date(dia)
      return `${String(d.getHours()).padStart(2, '0')}h`
    }
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
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Média/{granularidade === 'hora' ? 'hora ativa' : 'dia ativo'}</p>
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

// Data local no formato YYYY-MM-DD. Não usar toISOString().slice(0,10): ele
// converte para UTC e, à noite no fuso do Brasil, joga a mensagem para o dia
// seguinte — o gráfico ficava com um dia de defasagem no fim do expediente.
function toDiaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Mensagens do tenant no intervalo, paginadas.
//
// O gráfico conta CONVERSAS COM ATIVIDADE no dia, e para isso precisa da data
// real de cada mensagem. Antes ele agrupava por `conversations.ultima_mensagem_em`,
// o que dava uma barra única por conversa no dia em que ela falou pela última
// vez: uma semana inteira de atendimento aparecia empilhada em um só dia.
//
// O PostgREST devolve no máximo 1000 linhas por requisição, daí a paginação. O
// teto de 20 páginas evita travar a tela em tenants de volume alto — no pior
// caso o gráfico subestima os dias mais antigos da janela, o que é preferível a
// uma aba congelada.
const MSGS_PAGINA = 1000
const MSGS_MAX_PAGINAS = 20

async function buscarMensagensPeriodo(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  inicioISO: string,
  fimISO: string,
): Promise<Array<{ conversation_id: string; criado_em: string }>> {
  const todas: Array<{ conversation_id: string; criado_em: string }> = []
  for (let pagina = 0; pagina < MSGS_MAX_PAGINAS; pagina++) {
    const { data, error } = await supabase
      .from('messages')
      .select('conversation_id, criado_em')
      .eq('tenant_id', tenantId)
      .gte('criado_em', inicioISO)
      .lte('criado_em', fimISO)
      .order('criado_em', { ascending: true })
      .range(pagina * MSGS_PAGINA, pagina * MSGS_PAGINA + MSGS_PAGINA - 1)
    if (error || !data || data.length === 0) break
    todas.push(...(data as Array<{ conversation_id: string; criado_em: string }>))
    if (data.length < MSGS_PAGINA) break
  }
  return todas
}

function logParaAtividade(log: { id: string; acao: string; descricao: string; criado_em: string }): AtividadeItem {
  const corMap: Record<string, string> = {
    pausou_ia:'#F59E0B', retomou_ia:'#10B981', enviou_mensagem:'#818CF8', enviou_midia:'#818CF8',
  }
  return { id:`log_${log.id}`, tipo:'log', texto:log.descricao, cor:corMap[log.acao]??'var(--text-muted)', criado_em:log.criado_em }
}

const CONV_LIMIT_STEP = 20

// A rota de status devolve o vocabulário da Evolution ('open') ou o nosso
// ('conectado'), conforme a origem da resposta. Qualquer outro valor —
// 'connecting', 'close', 'banido' — significa que o número não está recebendo.
const ESTADOS_CONECTADOS = ['open', 'conectado']

// ─── Página principal ─────────────────────────────────────────────────────────

export default function VisaoGeralPage() {
  const router = useRouter()
  const [metrics, setMetrics]               = useState<Metrics | null>(null)
  const [crmStats, setCrmStats]             = useState<CRMStats | null>(null)
  const [crmCarregando, setCrmCarregando]   = useState(false)
  const [conversas, setConversas]           = useState<ConversaRecente[]>([])
  const [conversasFiltradas, setConversasFiltradas] = useState<ConversaRecente[]>([])
  const [grafico, setGrafico]               = useState<DiaDado[]>([])
  const [periodo, setPeriodo]               = useState<Periodo>('30')
  // Intervalo customizado (snapshot, sem realtime). Quando definido, tem
  // precedência sobre o preset. `custom` guarda o intervalo aplicado; os
  // campos temporários abaixo alimentam o popover antes de "Aplicar".
  const [custom, setCustom]                 = useState<{ inicio: string; fim: string } | null>(null)
  const [showCustom, setShowCustom]         = useState(false)
  const [customTmp, setCustomTmp]           = useState<{ inicio: string; fim: string }>({ inicio: '', fim: '' })
  const customRef = useRef<HTMLDivElement>(null)
  const [filtroStatus, setFiltroStatus]     = useState<FiltroStatus>('todos')
  const [carregando, setCarregando]         = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [convLimit, setConvLimit]           = useState(CONV_LIMIT_STEP)
  const [nomeUsuario, setNomeUsuario]       = useState('')
  const [tenantId, setTenantId]             = useState<string | null>(null)
  const [pausando, setPausando]             = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [instanciasProblema, setInstanciasProblema] = useState<InstanciaProblema[]>([])
  const [desconectando, setDesconectando]   = useState<Record<string, boolean>>({})
  const [confirmDesconectar, setConfirmDesconectar] = useState<string | null>(null)
  const [atividades, setAtividades]         = useState<AtividadeItem[]>([])
  const exportRef = useRef<HTMLDivElement>(null)
  const graficoCache = useRef<Record<string, DiaDado[]>>({})

  useEffect(() => {
    function h(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportModal(false)
      if (customRef.current && !customRef.current.contains(e.target as Node)) setShowCustom(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Busca CRM stats com cache localStorage 15min
  const fetchCRMStats = useCallback(async (sel: Selecao) => {
    setCrmCarregando(true)
    setCrmStats(null) // limpa antes de buscar — sem dados antigos
    try {
      const qs = sel.custom
        ? `inicio=${sel.custom.inicio}&fim=${sel.custom.fim}`
        : `periodo=${sel.periodo}`
      const res = await fetch(`/api/visao-geral/crm-stats?${qs}`)
      if (res.ok) {
        const data = await res.json() as CRMStats
        setCrmStats(data)
      }
    } catch { /* não crítico */ } finally {
      setCrmCarregando(false)
    }
  }, [])

  // KPIs do período — conversas (atividade), novas (criadas), escaladas para
  // humano e concluídas, cada uma com o período anterior de mesmo tamanho para
  // o indicador de variação. Segue Hoje/7d/30d/90d.
  const fetchMetrics = useCallback(async (sel: Selecao, tid: string) => {
    const supabase = createClient()
    const { inicioAtual, fimAtual, inicioAnterior, fimAnterior } = janelaDaSelecao(sel)
    const conv = () => supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tid)
    const encerradas = ['encerrada', 'encerrado']
    const [convAtual, convAnt, novasAtual, novasAnt, escAtual, escAnt, conclAtual, conclAnt] = await Promise.all([
      conv().gte('ultima_mensagem_em', inicioAtual).lt('ultima_mensagem_em', fimAtual),
      conv().gte('ultima_mensagem_em', inicioAnterior).lt('ultima_mensagem_em', fimAnterior),
      conv().gte('criado_em', inicioAtual).lt('criado_em', fimAtual),
      conv().gte('criado_em', inicioAnterior).lt('criado_em', fimAnterior),
      conv().gte('pausado_em', inicioAtual).lt('pausado_em', fimAtual),
      conv().gte('pausado_em', inicioAnterior).lt('pausado_em', fimAnterior),
      conv().in('status', encerradas).gte('ultima_mensagem_em', inicioAtual).lt('ultima_mensagem_em', fimAtual),
      conv().in('status', encerradas).gte('ultima_mensagem_em', inicioAnterior).lt('ultima_mensagem_em', fimAnterior),
    ])
    setMetrics({
      conversas: convAtual.count ?? 0,   conversasAnterior: convAnt.count ?? 0,
      novas: novasAtual.count ?? 0,      novasAnterior: novasAnt.count ?? 0,
      escaladas: escAtual.count ?? 0,    escaladasAnterior: escAnt.count ?? 0,
      concluidas: conclAtual.count ?? 0, concluidasAnterior: conclAnt.count ?? 0,
    })
  }, [])

  // Recalcula os KPIs quando a seleção muda (e assim que o tenant é conhecido).
  useEffect(() => { if (tenantId) fetchMetrics({ custom, periodo }, tenantId) }, [custom, periodo, tenantId, fetchMetrics])

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

      // Sem filtro de status: o cron encerra conversas paradas há 24h, então
      // filtrar por 'ativa' deixava esta tabela vazia depois de um fim de
      // semana — parecia que a dashboard tinha perdido os atendimentos. O
      // recorte por status agora é escolha do usuário, no filtro acima da lista.
      // O status vem da API, não da tabela: `tenant_instances.status` depende do
      // evento connection.update chegar, e quando ele não chega o registro
      // congela. A rota consulta o socket da Evolution e corrige o banco.
      const [convRes, statusRes] = await Promise.all([
        supabase.from('conversations').select(`id,contato_nome,contato_telefone,status,agente_pausado,ultima_mensagem_em,messages(conteudo,criado_em)`).eq('tenant_id',tid).order('ultima_mensagem_em',{ascending:false}).limit(CONV_LIMIT_STEP),
        fetch(`/api/whatsapp/status?tenant_id=${tid}`)
          .then(r => r.ok ? r.json() as Promise<{ instancias: InstanciaProblema[] }> : { instancias: [] })
          .catch(() => ({ instancias: [] as InstanciaProblema[] })),
      ])

      setInstanciasProblema(
        (statusRes.instancias ?? []).filter(i => !ESTADOS_CONECTADOS.includes(i.status))
      )

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

  // CRM stats — atualiza quando a seleção muda
  useEffect(() => { fetchCRMStats({ custom, periodo }) }, [custom, periodo, fetchCRMStats])

  const fetchGrafico = useCallback(async (sel: Selecao) => {
    const p = sel.periodo
    // Chave de cache: preset por nome; custom pelo intervalo. "Hoje" nunca usa
    // cache (é tempo real do dia vigente).
    const cacheKey = sel.custom ? `c:${sel.custom.inicio}:${sel.custom.fim}` : p
    const usaCache = !(!sel.custom && p === '1')
    if (usaCache && graficoCache.current[cacheKey]) { setGrafico(graficoCache.current[cacheKey]); return }
    const supabase = createClient()
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) return
    const { data:userData } = await supabase.from('users').select('tenant_id').eq('id',user.id).single()
    if (!userData?.tenant_id) return
    const tid = userData.tenant_id

    // Hoje (preset): buckets por hora (00h → hora atual), leitura em tempo real.
    if (!sel.custom && p === '1') {
      const hoje0 = new Date(); hoje0.setHours(0,0,0,0)
      const msgs = await buscarMensagensPeriodo(supabase, tid, hoje0.toISOString(), new Date().toISOString())
      const y = hoje0.getFullYear(), m = String(hoje0.getMonth()+1).padStart(2,'0'), d = String(hoje0.getDate()).padStart(2,'0')
      const horaAtual = new Date().getHours()
      const chaveHora = (h: number) => `${y}-${m}-${d}T${String(h).padStart(2,'0')}:00:00`
      const porHora: Record<string, Set<string>> = {}
      for (let h = 0; h <= horaAtual; h++) porHora[chaveHora(h)] = new Set()
      msgs.forEach(msg => {
        const dt = new Date(msg.criado_em)
        if (isNaN(dt.getTime())) return
        porHora[chaveHora(dt.getHours())]?.add(msg.conversation_id)
      })
      setGrafico(Object.entries(porHora).map(([dia, convs]) => ({ dia, total: convs.size })))
      return
    }

    // Janela em dias: preset (N dias móveis) ou custom (intervalo escolhido).
    let inicio: Date, fim: Date
    if (sel.custom) {
      inicio = new Date(`${sel.custom.inicio}T00:00:00`)
      fim    = new Date(`${sel.custom.fim}T23:59:59.999`)
    } else {
      inicio = new Date(); inicio.setDate(inicio.getDate()-parseInt(p)); inicio.setHours(0,0,0,0)
      fim = new Date(); fim.setHours(23,59,59,999)
    }
    const msgs = await buscarMensagensPeriodo(supabase, tid, inicio.toISOString(), fim.toISOString())
    const porDia: Record<string, Set<string>> = {}
    const curr = new Date(inicio)
    while (curr<=fim) { porDia[toDiaLocal(curr)] = new Set(); curr.setDate(curr.getDate()+1) }
    msgs.forEach(msg => {
      const dt = new Date(msg.criado_em)
      if (isNaN(dt.getTime())) return
      porDia[toDiaLocal(dt)]?.add(msg.conversation_id)
    })
    const resultado = Object.entries(porDia).map(([dia, convs]) => ({ dia, total: convs.size }))
    graficoCache.current[cacheKey] = resultado
    setGrafico(resultado)
  }, [])

  useEffect(() => { fetchGrafico({ custom, periodo }) }, [custom, periodo, fetchGrafico])

  // Tempo real (Otimização A): assina SÓ no "Hoje" (dia vigente), onde o ao
  // vivo importa. 7/30/90 e intervalos customizados são snapshots — sem
  // assinatura, sem custo contínuo. A assinatura é push (não faz polling) e o
  // refresh só ocorre com a aba visível, evitando trabalho em abas em segundo
  // plano; o debounce agrupa rajadas de eventos.
  useEffect(() => {
    if (!tenantId || custom || periodo !== '1') return
    const supabase = createClient()
    const sel: Selecao = { custom: null, periodo: '1' }
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => { fetchMetrics(sel, tenantId); fetchGrafico(sel) }
    const agendarRefresh = () => {
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 4000)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    const channel = supabase
      .channel(`visao-geral-rt-${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${tenantId}` },
        agendarRefresh
      ).subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [tenantId, custom, periodo, fetchMetrics, fetchGrafico])

  const handleCarregarMais = useCallback(async () => {
    if (!tenantId) return
    setCarregandoMais(true)
    const novoLimit = convLimit + CONV_LIMIT_STEP
    const supabase = createClient()
    type ConvRaw = { id:string;contato_nome:string;contato_telefone:string;status:string;agente_pausado:boolean;ultima_mensagem_em:string;messages:Array<{conteudo:string;criado_em:string}> }
    const { data } = await supabase.from('conversations').select(`id,contato_nome,contato_telefone,status,agente_pausado,ultima_mensagem_em,messages(conteudo,criado_em)`).eq('tenant_id',tenantId).order('ultima_mensagem_em',{ascending:false}).limit(novoLimit)
    const convComMsg: ConversaRecente[] = ((data??[]) as unknown as ConvRaw[]).map(c => {
      const msgs = (c.messages??[]).sort((a,b)=>new Date(b.criado_em).getTime()-new Date(a.criado_em).getTime())
      return { ...c, ultima_mensagem:msgs[0]?.conteudo??'—' }
    })
    setConversas(convComMsg); setConvLimit(novoLimit); setCarregandoMais(false)
  }, [tenantId, convLimit])

  useEffect(() => {
    if (filtroStatus === 'todos') { setConversasFiltradas(conversas); return }
    if (filtroStatus === 'encerrado') { setConversasFiltradas(conversas.filter(estaEncerrada)); return }
    setConversasFiltradas(conversas.filter(c =>
      !estaEncerrada(c) && (filtroStatus === 'pausado' ? c.agente_pausado : !c.agente_pausado)
    ))
  }, [filtroStatus, conversas])

  // Mesma navegação da tela de Histórico: a linha leva para a conversa.
  function abrirConversa(id: string) {
    router.push(`/conversas/${id}`)
  }

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
      if (res.ok) setInstanciasProblema(prev=>prev.filter(i=>i.instance_name!==instanceName))
    } finally { setDesconectando(prev=>({...prev,[instanceName]:false})) }
  }

  const temMaisConversas = conversas.length >= convLimit

  // Seleção ativa (preset ou intervalo customizado) e rótulos derivados.
  const sel: Selecao = { custom, periodo }
  const selTitulo = tituloSelecao(sel)
  const selFrase  = fraseSelecao(sel)
  const graficoPorHora = !custom && periodo === '1'

  function aplicarCustom() {
    if (!customTmp.inicio || !customTmp.fim) return
    // Garante início <= fim
    const [ini, fim] = customTmp.inicio <= customTmp.fim
      ? [customTmp.inicio, customTmp.fim]
      : [customTmp.fim, customTmp.inicio]
    setCustom({ inicio: ini, fim: fim })
    setShowCustom(false)
  }
  function limparCustom() {
    setCustom(null)
    setCustomTmp({ inicio: '', fim: '' })
    setShowCustom(false)
  }

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
            Como seu agente performou {selFrase}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
            {(['1','7','30','90'] as const).map(p => {
              const ativo = !custom && periodo === p
              return (
                <button key={p} onClick={() => { setCustom(null); setPeriodo(p) }}
                  className="px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{ background: ativo ? '#10B981' : 'transparent', color: ativo ? '#fff' : 'var(--text-muted)' }}>
                  {p === '1' ? 'Hoje' : `${p}d`}
                </button>
              )
            })}
          </div>

          {/* Intervalo customizado — snapshot, sem realtime (Otimização B) */}
          <div className="relative" ref={customRef}>
            <button
              onClick={() => { setShowCustom(v => !v); if (custom) setCustomTmp(custom) }}
              className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: custom ? 'rgba(16,185,129,.1)' : 'var(--bg-surface)',
                border: `1px solid ${custom ? 'rgba(16,185,129,.3)' : 'var(--border)'}`,
                color: custom ? '#10B981' : 'var(--text-muted)',
              }}>
              <Calendar size={13} />
              <span className={custom ? '' : 'hidden sm:inline'}>{custom ? selTitulo : 'Período'}</span>
              {custom && (
                <span onClick={(e) => { e.stopPropagation(); limparCustom() }} className="ml-0.5 hover:opacity-70">
                  <X size={11} />
                </span>
              )}
            </button>

            {showCustom && (
              <div className="absolute right-0 z-50 rounded-xl shadow-2xl p-4"
                style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', width: 260, top: 40 }}>
                <p className="text-xs mb-2" style={{ color:'var(--text-muted)' }}>Intervalo personalizado (snapshot)</p>
                <label className="text-[11px]" style={{ color:'var(--text-secondary)' }}>De</label>
                <input type="date" value={customTmp.inicio} max={customTmp.fim || undefined}
                  onChange={e => setCustomTmp(t => ({ ...t, inicio: e.target.value }))}
                  className="w-full text-xs rounded-lg px-2.5 py-1.5 mb-2 mt-0.5 outline-none"
                  style={{ background:'var(--bg-surface-2)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
                <label className="text-[11px]" style={{ color:'var(--text-secondary)' }}>Até</label>
                <input type="date" value={customTmp.fim} min={customTmp.inicio || undefined}
                  onChange={e => setCustomTmp(t => ({ ...t, fim: e.target.value }))}
                  className="w-full text-xs rounded-lg px-2.5 py-1.5 mb-3 mt-0.5 outline-none"
                  style={{ background:'var(--bg-surface-2)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
                <div className="flex items-center justify-between">
                  <button onClick={limparCustom} className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ border:'1px solid var(--border)', background:'var(--bg-surface-2)', color:'var(--text-secondary)' }}>Limpar</button>
                  <button onClick={aplicarCustom} disabled={!customTmp.inicio || !customTmp.fim}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                    style={{ background:'#10B981', color:'#000', border:'none' }}>Aplicar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alerta: número banido ou desconectado.
          Antes só o banimento era sinalizado. Uma instância que simplesmente cai
          — sessão expirada, celular desconectado — não avisava ninguém: a
          dashboard seguia em silêncio enquanto os clientes mandavam mensagem no
          WhatsApp e o agente não recebia nada. */}
      {instanciasProblema.length > 0 && (
        <div className="rounded-xl p-4 space-y-3" style={{ background:'#EF444408', border:'1px solid #EF444430' }}>
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-400">
              {instanciasProblema.every(i => i.status === 'banido')
                ? (instanciasProblema.length === 1 ? 'Número banido pelo WhatsApp' : `${instanciasProblema.length} números banidos`)
                : 'WhatsApp desconectado — o agente não está recebendo mensagens'}
            </p>
          </div>
          <div className="space-y-2">
            {instanciasProblema.map(inst => {
              const estaDesconectando = desconectando[inst.instance_name]??false
              const pedindoConfirm    = confirmDesconectar===inst.instance_name
              const banido            = inst.status === 'banido'
              return (
                <div key={inst.id} className="rounded-lg p-3" style={{ background:'#EF444410', border:'1px solid #EF444425' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldAlert size={13} className="text-red-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-red-400">{inst.apelido}</span>
                        <span className="text-xs font-mono ml-2 hidden sm:inline" style={{ color:'var(--text-muted)' }}>{inst.instance_name}</span>
                        <p className="text-xs mt-0.5" style={{ color:'var(--text-secondary)' }}>
                          {banido
                            ? 'Número bloqueado pelo WhatsApp. Fale com o suporte.'
                            : 'Reconecte lendo o QR Code para o agente voltar a atender.'}
                        </p>
                      </div>
                    </div>
                    {!pedindoConfirm ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!banido && (
                          <a href="/reconexao-whatsapp"
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                            style={{ background:'#F59E0B', border:'1px solid #F59E0B', color:'#000' }}>
                            <Smartphone size={12} /> Reconectar agora
                          </a>
                        )}
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
          Desempenho · {selTitulo}
        </p>
        <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
      </div>

      {/* ── KPIs do período ────────────────────────────────────────────────── */}
      {metrics ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <KpiCard label="Conversas no período" valor={metrics.conversas}  d={delta(metrics.conversas,metrics.conversasAnterior)}   icon={MessageSquare} cor="#10B981" />
          <KpiCard label="Novas conversas"      valor={metrics.novas}      d={delta(metrics.novas,metrics.novasAnterior)}           icon={Users}         cor="#3B82F6" />
          <KpiCard label="Escaladas p/ humano"  valor={metrics.escaladas}  d={delta(metrics.escaladas,metrics.escaladasAnterior)}   icon={PauseCircle}   cor="#F59E0B" alt />
          <KpiCard label="Concluídas"           valor={metrics.concluidas} d={delta(metrics.concluidas,metrics.concluidasAnterior)} icon={CheckCircle2}  cor="#8B5CF6" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[...Array(4)].map((_,i)=>(<div key={i} className="h-28 rounded-xl animate-pulse" style={{background:'var(--bg-surface)',border:'1px solid var(--border)'}} />))}
        </div>
      )}

      {/* ── Gráfico + coluna direita ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl p-4 md:p-6" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
          <div className="mb-4">
            <h2 className="font-semibold text-sm md:text-base" style={{ color:'var(--text-primary)' }}>
              Volume de conversas — {selTitulo}
            </h2>
            <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>
              {graficoPorHora
                ? 'Conversas com mensagem em cada hora do dia vigente.'
                : 'Conversas com mensagem em cada dia — uma conversa que segue no dia seguinte conta nos dois.'}
            </p>
          </div>
          <GraficoBarras dados={grafico} crmStats={crmStats} granularidade={graficoPorHora ? 'hora' : 'dia'} onExport={() => exportarGraficoPDF(grafico, selTitulo, graficoPorHora)} />
        </div>

        <div className="space-y-4">
          {crmCarregando ? (
          <div className="rounded-xl p-4 md:p-5" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
            <div className="h-4 w-32 rounded animate-pulse mb-3" style={{ background:'var(--bg-surface-2)' }} />
            <div className="h-3 w-48 rounded animate-pulse mb-4" style={{ background:'var(--bg-surface-2)' }} />
            <div className="space-y-3">
              {[...Array(3)].map((_,i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md animate-pulse flex-shrink-0" style={{ background:'var(--bg-surface-2)' }} />
                  <div className="h-3 rounded animate-pulse flex-1" style={{ background:'var(--bg-surface-2)' }} />
                </div>
              ))}
            </div>
          </div>
        ) : crmStats ? (
          <InsightsCRM stats={crmStats} titulo={selTitulo} frase={selFrase} />
        ) : null}

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
              {conversasFiltradas.length} conversa{conversasFiltradas.length!==1?'s':''}
              {filtroStatus!=='todos' && ` ${({ativo:'ativa',pausado:'pausada',encerrado:'encerrada'} as const)[filtroStatus]}${conversasFiltradas.length!==1?'s':''}`}.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background:'var(--bg-surface-2)', border:'1px solid var(--border)' }}>
              {([['todos','Todas'],['ativo','Ativas'],['pausado','Pausadas'],['encerrado','Encerradas']] as const).map(([val,label]) => (
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
                    <tr key={c.id} className="transition-colors last:border-0 cursor-pointer" style={{ borderBottom:'1px solid var(--border)' }}
                      onClick={() => abrirConversa(c.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirConversa(c.id) } }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Abrir conversa com ${c.contato_nome || c.contato_telefone}`}
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
                        {(() => {
                          const rotulo = rotuloStatus(c)
                          const cor = CORES_STATUS[rotulo]
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ background:`${cor}1A`, border:`1px solid ${cor}4D`, color:cor }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background:cor }} /> {rotulo}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm" style={{ color:'var(--text-muted)' }}>{tempoRelativo(c.ultima_mensagem_em)}</span>
                      </td>
                      <td className="px-6 py-4">
                        {/* Pausar/retomar não se aplica a conversa encerrada: o
                            agente só volta a responder quando o cliente escreve
                            de novo, e aí a conversa é reaberta pelo webhook. */}
                        {estaEncerrada(c) ? (
                          <span className="text-xs" style={{ color:'var(--text-label)' }}>—</span>
                        ) : (
                          // stopPropagation: a linha inteira navega para a
                          // conversa, e pausar o agente não pode arrastar o
                          // operador para outra tela junto.
                          <button onClick={e => { e.stopPropagation(); handlePausarRetomar(c) }} disabled={pausando===c.id}
                            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${c.agente_pausado?'bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 border border-[#10B981]/30':'bg-[#F59E0B]/10 text-[#F59E0B] hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30'}`}>
                            {c.agente_pausado?<><Play size={11} /> Retomar</>:<><Pause size={11} /> Pausar</>}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y" style={{ borderColor:'var(--border)' }}>
              {conversasFiltradas.map(c => (
                <div key={c.id} className="p-4 space-y-2 cursor-pointer" onClick={() => abrirConversa(c.id)}>
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
                    {(() => {
                      const rotulo = rotuloStatus(c)
                      const cor = CORES_STATUS[rotulo]
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ background:`${cor}1A`, border:`1px solid ${cor}4D`, color:cor }}>{rotulo}</span>
                      )
                    })()}
                  </div>
                  <p className="text-xs truncate" style={{ color:'var(--text-secondary)' }}>{c.ultima_mensagem}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color:'var(--text-muted)' }}>{tempoRelativo(c.ultima_mensagem_em)}</span>
                    {!estaEncerrada(c) && (
                      <button onClick={e => { e.stopPropagation(); handlePausarRetomar(c) }} disabled={pausando===c.id}
                        className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${c.agente_pausado?'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30':'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30'}`}>
                        {c.agente_pausado?<><Play size={10} /> Retomar</>:<><Pause size={10} /> Pausar</>}
                      </button>
                    )}
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