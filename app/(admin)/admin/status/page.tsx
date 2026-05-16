'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Database, Zap, Bot, Server, Cloud, Activity,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusLevel = 'ok' | 'degradado' | 'erro' | 'verificando'

interface ServicoStatus {
  nome: string
  descricao: string
  status: StatusLevel
  latencia: number | null
  detalhe: string
  icon: React.ElementType
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusCor(s: StatusLevel) {
  if (s === 'ok')          return '#10B981'
  if (s === 'degradado')   return '#F59E0B'
  if (s === 'erro')        return '#EF4444'
  return 'var(--text-muted)'
}

function statusBg(s: StatusLevel) {
  if (s === 'ok')          return '#10B98112'
  if (s === 'degradado')   return '#F59E0B12'
  if (s === 'erro')        return '#EF444412'
  return 'var(--bg-hover)'
}

function statusLabel(s: StatusLevel) {
  if (s === 'ok')          return 'Operacional'
  if (s === 'degradado')   return 'Degradado'
  if (s === 'erro')        return 'Falha'
  return 'Verificando...'
}

function StatusIcon({ status }: { status: StatusLevel }) {
  if (status === 'ok')        return <CheckCircle2 size={16} color="#10B981" />
  if (status === 'degradado') return <AlertTriangle size={16} color="#F59E0B" />
  if (status === 'erro')      return <XCircle size={16} color="#EF4444" />
  return <RefreshCw size={16} color="var(--text-muted)" className="animate-spin" />
}

function StatusBadge({ status }: { status: StatusLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
      style={{ color: statusCor(status), background: statusBg(status), borderColor: `${statusCor(status)}40` }}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'ok' ? 'animate-pulse' : ''}`}
        style={{ background: statusCor(status) }} />
      {statusLabel(status)}
    </span>
  )
}

// ─── Verificações ─────────────────────────────────────────────────────────────

async function verificarSupabase(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon'>> {
  const t = Date.now()
  try {
    const supabase = createClient()
    const { error } = await supabase.from('tenants').select('id', { count: 'exact', head: true })
    const latencia = Date.now() - t
    if (error) throw error
    return {
      status: latencia > 2000 ? 'degradado' : 'ok',
      latencia,
      detalhe: latencia > 2000 ? `Resposta lenta: ${latencia}ms` : `Respondendo em ${latencia}ms`,
    }
  } catch (e) {
    return { status: 'erro', latencia: null, detalhe: `Erro: ${(e as Error).message}` }
  }
}

async function verificarEvolution(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon'>> {
  const t = Date.now()
  try {
    const res = await fetch('/api/admin/health/evolution', { signal: AbortSignal.timeout(5000) })
    const latencia = Date.now() - t
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      status: latencia > 3000 ? 'degradado' : 'ok',
      latencia,
      detalhe: data.instancias
        ? `${data.instancias} instância(s) ativa(s) · ${latencia}ms`
        : `Respondendo em ${latencia}ms`,
    }
  } catch (e) {
    return { status: 'erro', latencia: null, detalhe: `Inacessível: ${(e as Error).message}` }
  }
}

async function verificarRedis(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon'>> {
  const t = Date.now()
  try {
    const res = await fetch('/api/admin/health/redis', { signal: AbortSignal.timeout(5000) })
    const latencia = Date.now() - t
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return {
      status: latencia > 2000 ? 'degradado' : 'ok',
      latencia,
      detalhe: `Ping OK · ${latencia}ms`,
    }
} catch {
    return { status: 'degradado', latencia: null, detalhe: 'Rate limit inativo (sistema continua funcionando)' }
  }
}

async function verificarOpenAI(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon'>> {
  const t = Date.now()
  try {
    const res = await fetch('/api/admin/health/openai', { signal: AbortSignal.timeout(8000) })
    const latencia = Date.now() - t
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return {
      status: latencia > 5000 ? 'degradado' : 'ok',
      latencia,
      detalhe: `API acessível · ${latencia}ms`,
    }
  } catch (e) {
    return { status: 'erro', latencia: null, detalhe: `Erro: ${(e as Error).message}` }
  }
}

async function verificarAnthropic(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon'>> {
  const t = Date.now()
  try {
    const res = await fetch('/api/admin/health/anthropic', { signal: AbortSignal.timeout(8000) })
    const latencia = Date.now() - t
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return {
      status: latencia > 5000 ? 'degradado' : 'ok',
      latencia,
      detalhe: `API acessível · ${latencia}ms`,
    }
  } catch (e) {
    return { status: 'erro', latencia: null, detalhe: `Erro: ${(e as Error).message}` }
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

const SERVICOS_BASE: Pick<ServicoStatus, 'nome' | 'descricao' | 'icon'>[] = [
  { nome: 'Supabase',      descricao: 'Banco de dados principal e autenticação',       icon: Database },
  { nome: 'Evolution API', descricao: 'Gateway WhatsApp — envio e recebimento',        icon: Zap },
  { nome: 'Upstash Redis', descricao: 'Rate limiting e proteção contra abusos',        icon: Server },
  { nome: 'OpenAI',        descricao: 'Motor de IA principal dos agentes',             icon: Bot },
  { nome: 'Anthropic',     descricao: 'Motor de IA backup dos agentes',                icon: Cloud },
  { nome: 'Vercel',        descricao: 'Hospedagem e deploy da aplicação',              icon: Activity },
]

export default function StatusPage() {
  const [servicos, setServicos] = useState<ServicoStatus[]>(
    SERVICOS_BASE.map(s => ({ ...s, status: 'verificando', latencia: null, detalhe: 'Aguardando...' }))
  )
  const [ultimaVerificacao, setUltimaVerificacao] = useState<Date | null>(null)
  const [verificando, setVerificando] = useState(false)

  const verificarTodos = useCallback(async () => {
    setVerificando(true)
    setServicos(prev => prev.map(s => ({ ...s, status: 'verificando', detalhe: 'Verificando...' })))

    const [supabase, evolution, redis, openai, anthropic] = await Promise.all([
      verificarSupabase(),
      verificarEvolution(),
      verificarRedis(),
      verificarOpenAI(),
      verificarAnthropic(),
    ])

    const vercel: Omit<ServicoStatus, 'nome' | 'descricao' | 'icon'> = {
      status: 'ok',
      latencia: null,
      detalhe: 'Aplicação rodando normalmente',
    }

    const resultados = [supabase, evolution, redis, openai, anthropic, vercel]

    setServicos(SERVICOS_BASE.map((base, i) => ({ ...base, ...resultados[i] })))
    setUltimaVerificacao(new Date())
    setVerificando(false)
  }, [])

  useEffect(() => {
    verificarTodos()
    const interval = setInterval(verificarTodos, 60000) // verifica a cada 1 minuto
    return () => clearInterval(interval)
  }, [verificarTodos])

  const totalOk        = servicos.filter(s => s.status === 'ok').length
  const totalErro      = servicos.filter(s => s.status === 'erro').length
  const totalDegradado = servicos.filter(s => s.status === 'degradado').length

  const statusGeral: StatusLevel =
    totalErro > 0 ? 'erro' :
    totalDegradado > 0 ? 'degradado' :
    servicos.some(s => s.status === 'verificando') ? 'verificando' : 'ok'

  const mensagemGeral =
    statusGeral === 'ok'        ? 'Todos os serviços operando normalmente.' :
    statusGeral === 'degradado' ? 'Alguns serviços com desempenho reduzido.' :
    statusGeral === 'erro'      ? `${totalErro} serviço(s) com falha detectada.` :
    'Verificando serviços...'

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Painel Administrativo</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Status do Sistema</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Monitoramento em tempo real de todos os serviços integrados.
          </p>
        </div>
        <button
          onClick={verificarTodos}
          disabled={verificando}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={14} className={verificando ? 'animate-spin' : ''} />
          Verificar agora
        </button>
      </div>

      {/* Banner status geral */}
      <div className="rounded-xl p-5 flex items-center gap-4"
        style={{ background: statusBg(statusGeral), border: `1px solid ${statusCor(statusGeral)}30` }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `${statusCor(statusGeral)}20` }}>
          <StatusIcon status={statusGeral} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {statusGeral === 'ok' ? 'Sistema operacional' :
               statusGeral === 'degradado' ? 'Sistema com degradação' :
               statusGeral === 'erro' ? 'Falha detectada' : 'Verificando...'}
            </p>
            <StatusBadge status={statusGeral} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{mensagemGeral}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Última verificação</p>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {ultimaVerificacao
              ? ultimaVerificacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '—'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {totalOk}/{servicos.length} operacionais
          </p>
        </div>
      </div>

      {/* Cards de serviços */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Serviços monitorados
        </h2>
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {servicos.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.nome}
                className="flex items-center gap-4 px-5 py-4 transition-colors"
                style={{
                  borderBottom: i < servicos.length - 1 ? '1px solid var(--border)' : 'none',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>

                {/* Ícone do serviço */}
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: statusBg(s.status) }}>
                  <Icon size={16} color={statusCor(s.status)} />
                </div>

                {/* Nome + descrição */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.nome}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.descricao}</p>
                </div>

                {/* Detalhe / latência */}
                <div className="hidden sm:block text-right">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.detalhe}</p>
                  {s.latencia !== null && (
                    <p className="text-xs mt-0.5" style={{
                      color: s.latencia > 2000 ? '#F59E0B' : s.latencia > 1000 ? '#F59E0B' : 'var(--text-muted)'
                    }}>
                      {s.latencia}ms
                    </p>
                  )}
                </div>

                {/* Badge de status */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  <StatusIcon status={s.status} />
                  <span className="hidden md:inline text-xs font-medium" style={{ color: statusCor(s.status) }}>
                    {statusLabel(s.status)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Guia de interpretação */}
      <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Como interpretar os status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { status: 'ok' as StatusLevel,        titulo: 'Operacional',       desc: 'Serviço funcionando normalmente. Nenhuma ação necessária.' },
            { status: 'degradado' as StatusLevel,  titulo: 'Degradado',         desc: 'Serviço lento ou com falhas intermitentes. Monitore.' },
            { status: 'erro' as StatusLevel,       titulo: 'Falha',             desc: 'Serviço inacessível. Pode impactar o atendimento.' },
          ].map(item => (
            <div key={item.status} className="rounded-lg p-3" style={{ background: statusBg(item.status), border: `1px solid ${statusCor(item.status)}25` }}>
              <div className="flex items-center gap-2 mb-1">
                <StatusIcon status={item.status} />
                <p className="text-xs font-semibold" style={{ color: statusCor(item.status) }}>{item.titulo}</p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs pt-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
          Em caso de falha, compartilhe o nome do serviço afetado e o horário com o suporte HubTek.
          A verificação é automática a cada 60 segundos.
        </p>
      </div>

    </div>
  )
}