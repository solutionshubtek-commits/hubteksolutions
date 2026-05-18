'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Database, Zap, Bot, Server, Cloud, Activity,
  ChevronDown, ChevronUp,
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
  acoes: AcaoContextual[]
}

interface AcaoContextual {
  titulo: string
  descricao: string
  link?: { label: string; url: string }
  codigo?: string
}

// ─── Ações contextuais por serviço e status ───────────────────────────────────

const ACOES: Record<string, Record<string, AcaoContextual[]>> = {
  'Supabase': {
    erro: [
      {
        titulo: 'Verifique o painel do Supabase',
        descricao: 'Acesse o dashboard para verificar se há algum incidente reportado ou se as credenciais expiraram.',
        link: { label: 'Abrir Supabase Dashboard', url: 'https://supabase.com/dashboard' },
      },
      {
        titulo: 'Verifique as variáveis de ambiente',
        descricao: 'Confirme que NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY estão corretas no Vercel.',
        link: { label: 'Abrir Vercel Env Vars', url: 'https://vercel.com/dashboard' },
      },
      {
        titulo: 'Impacto',
        descricao: 'Login, conversas, histórico e configurações ficam indisponíveis. É o serviço mais crítico do sistema.',
      },
    ],
    degradado: [
      {
        titulo: 'Banco respondendo lentamente',
        descricao: 'O Supabase está aceitando conexões mas com latência alta. Pode ser pico de uso ou instabilidade temporária. Monitore por alguns minutos.',
        link: { label: 'Ver status Supabase', url: 'https://status.supabase.com' },
      },
    ],
  },
  'Evolution API': {
    erro: [
      {
        titulo: 'Verifique se o Docker está rodando no VPS',
        descricao: 'Acesse o terminal da Hostinger e rode o comando abaixo para ver se os containers estão ativos:',
        codigo: 'docker ps',
      },
      {
        titulo: 'Reinicie a Evolution API se necessário',
        descricao: 'Se o container não aparecer no `docker ps`, rode:',
        codigo: 'cd /root/evolution-api && docker compose up -d',
      },
      {
        titulo: 'Acesse o terminal Hostinger',
        descricao: 'Entre no painel da Hostinger → VPS → Terminal para executar os comandos acima.',
        link: { label: 'Abrir Hostinger', url: 'https://hpanel.hostinger.com' },
      },
      {
        titulo: 'Impacto',
        descricao: 'Envio e recebimento de mensagens WhatsApp ficam indisponíveis. O agente não consegue responder clientes.',
      },
    ],
    degradado: [
      {
        titulo: 'API respondendo lentamente',
        descricao: 'A Evolution está aceitando conexões mas com alta latência. Pode impactar o tempo de resposta do agente. Monitore.',
        link: { label: 'Ver Evolution Manager', url: 'https://api.hubteksolutions.tech/manager' },
      },
    ],
  },
  'Upstash Redis': {
    erro: [
      {
        titulo: 'Rate limit desativado (não crítico)',
        descricao: 'O Redis está inacessível mas o sistema continua funcionando normalmente. O rate limiting apenas ficará inativo temporariamente.',
        link: { label: 'Ver Upstash Dashboard', url: 'https://console.upstash.com' },
      },
      {
        titulo: 'Verifique as variáveis de ambiente',
        descricao: 'Confirme que UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN estão configuradas no Vercel.',
        link: { label: 'Abrir Vercel', url: 'https://vercel.com/dashboard' },
      },
    ],
    degradado: [
      {
        titulo: 'Redis com latência alta',
        descricao: 'O rate limiting está funcionando mas mais lento que o normal. Não impacta o atendimento.',
      },
    ],
  },
  'OpenAI': {
    erro: [
      {
        titulo: 'Motor de IA principal indisponível',
        descricao: 'O agente tentará usar Anthropic como backup automaticamente. Verifique o status da OpenAI:',
        link: { label: 'Ver status OpenAI', url: 'https://status.openai.com' },
      },
      {
        titulo: 'Verifique a chave de API',
        descricao: 'Confirme que OPENAI_API_KEY está válida e com saldo disponível no painel da OpenAI.',
        link: { label: 'Abrir OpenAI Dashboard', url: 'https://platform.openai.com/usage' },
      },
      {
        titulo: 'Impacto',
        descricao: 'Se Anthropic também estiver em falha, o agente não conseguirá responder. Se Anthropic estiver ok, o atendimento continua normalmente via fallback.',
      },
    ],
    degradado: [
      {
        titulo: 'API respondendo lentamente',
        descricao: 'O agente pode demorar mais para responder. Monitore o status da OpenAI.',
        link: { label: 'Ver status OpenAI', url: 'https://status.openai.com' },
      },
    ],
  },
  'Anthropic': {
    erro: [
      {
        titulo: 'Motor de IA backup indisponível',
        descricao: 'O agente continuará usando OpenAI normalmente. A Anthropic é o backup — se OpenAI estiver ok, não há impacto no atendimento.',
        link: { label: 'Ver status Anthropic', url: 'https://status.anthropic.com' },
      },
      {
        titulo: 'Se o erro persistir por mais de 1 hora',
        descricao: 'Verifique a chave de API e o saldo disponível no painel da Anthropic.',
        link: { label: 'Abrir Anthropic Console', url: 'https://console.anthropic.com' },
      },
    ],
    degradado: [
      {
        titulo: 'API backup com latência',
        descricao: 'Não impacta o atendimento pois a Anthropic é usada apenas como fallback quando OpenAI falha.',
      },
    ],
  },
  'Vercel': {
    erro: [
      {
        titulo: 'Aplicação fora do ar',
        descricao: 'Se este card aparecer em erro, é porque algo muito grave aconteceu. Verifique o último deploy e considere fazer rollback.',
        link: { label: 'Abrir Vercel Dashboard', url: 'https://vercel.com/dashboard' },
      },
    ],
    degradado: [
      {
        titulo: 'Deploy com problemas',
        descricao: 'Verifique os logs do último deploy no Vercel para identificar o erro.',
        link: { label: 'Abrir Vercel Dashboard', url: 'https://vercel.com/dashboard' },
      },
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusCor(s: StatusLevel) {
  if (s === 'ok')        return '#10B981'
  if (s === 'degradado') return '#F59E0B'
  if (s === 'erro')      return '#EF4444'
  return 'var(--text-muted)'
}

function statusBg(s: StatusLevel) {
  if (s === 'ok')        return '#10B98112'
  if (s === 'degradado') return '#F59E0B12'
  if (s === 'erro')      return '#EF444412'
  return 'var(--bg-hover)'
}

function statusLabel(s: StatusLevel) {
  if (s === 'ok')        return 'Operacional'
  if (s === 'degradado') return 'Degradado'
  if (s === 'erro')      return 'Falha'
  return 'Verificando...'
}

function StatusIcon({ status, size = 16 }: { status: StatusLevel; size?: number }) {
  if (status === 'ok')        return <CheckCircle2 size={size} color="#10B981" />
  if (status === 'degradado') return <AlertTriangle size={size} color="#F59E0B" />
  if (status === 'erro')      return <XCircle size={size} color="#EF4444" />
  return <RefreshCw size={size} color="var(--text-muted)" className="animate-spin" />
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

async function verificarSupabase(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon' | 'acoes'>> {
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

async function verificarEvolution(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon' | 'acoes'>> {
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

async function verificarRedis(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon' | 'acoes'>> {
  const t = Date.now()
  try {
    const res = await fetch('/api/admin/health/redis', { signal: AbortSignal.timeout(5000) })
    const latencia = Date.now() - t
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { status: latencia > 2000 ? 'degradado' : 'ok', latencia, detalhe: `Ping OK · ${latencia}ms` }
  } catch {
    return { status: 'degradado', latencia: null, detalhe: 'Rate limit inativo (sistema continua funcionando)' }
  }
}

async function verificarOpenAI(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon' | 'acoes'>> {
  const t = Date.now()
  try {
    const res = await fetch('/api/admin/health/openai', { signal: AbortSignal.timeout(8000) })
    const latencia = Date.now() - t
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { status: latencia > 5000 ? 'degradado' : 'ok', latencia, detalhe: `API acessível · ${latencia}ms` }
  } catch (e) {
    return { status: 'erro', latencia: null, detalhe: `Erro: ${(e as Error).message}` }
  }
}

async function verificarAnthropic(): Promise<Omit<ServicoStatus, 'nome' | 'descricao' | 'icon' | 'acoes'>> {
  const t = Date.now()
  try {
    const res = await fetch('/api/admin/health/anthropic', { signal: AbortSignal.timeout(8000) })
    const latencia = Date.now() - t
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { status: latencia > 5000 ? 'degradado' : 'ok', latencia, detalhe: `API acessível · ${latencia}ms` }
  } catch (e) {
    return { status: 'erro', latencia: null, detalhe: `Erro: ${(e as Error).message}` }
  }
}

// ─── Card de serviço ──────────────────────────────────────────────────────────

function ServicoCard({ servico, index, total }: { servico: ServicoStatus; index: number; total: number }) {
  const [expandido, setExpandido] = useState(false)
  const Icon = servico.icon
  const temAcoes = servico.status !== 'ok' && servico.status !== 'verificando' && servico.acoes.length > 0

  return (
    <div style={{ borderBottom: index < total - 1 ? '1px solid var(--border)' : 'none' }}>
      {/* Linha principal */}
      <div
        className={`flex items-center gap-4 px-5 py-4 transition-colors ${temAcoes ? 'cursor-pointer' : ''}`}
        onClick={() => temAcoes && setExpandido(prev => !prev)}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: statusBg(servico.status) }}>
          <Icon size={16} color={statusCor(servico.status)} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{servico.nome}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{servico.descricao}</p>
        </div>

        <div className="hidden sm:block text-right">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{servico.detalhe}</p>
          {servico.latencia !== null && (
            <p className="text-xs mt-0.5" style={{ color: servico.latencia > 2000 ? '#F59E0B' : 'var(--text-muted)' }}>
              {servico.latencia}ms
            </p>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <StatusIcon status={servico.status} />
          <span className="hidden md:inline text-xs font-medium" style={{ color: statusCor(servico.status) }}>
            {statusLabel(servico.status)}
          </span>
          {temAcoes && (
            <span style={{ color: 'var(--text-muted)' }}>
              {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          )}
        </div>
      </div>

      {/* Painel de ações contextuais */}
      {temAcoes && expandido && (
        <div className="px-5 pb-5 space-y-3"
          style={{ background: statusBg(servico.status), borderTop: `1px solid ${statusCor(servico.status)}20` }}>
          <p className="text-xs font-semibold pt-4 uppercase tracking-wider"
            style={{ color: statusCor(servico.status) }}>
            O que fazer agora
          </p>
          {servico.acoes.map((acao, i) => (
            <div key={i} className="rounded-lg p-4 space-y-2"
              style={{ background: 'var(--bg-surface)', border: `1px solid ${statusCor(servico.status)}20` }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{acao.titulo}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{acao.descricao}</p>
              {acao.codigo && (
                <code className="block text-xs px-3 py-2 rounded-lg font-mono mt-1"
                  style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: '#10B981' }}>
                  {acao.codigo}
                </code>
              )}
              {acao.link && (
                <a href={acao.link.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold mt-1 hover:underline"
                  style={{ color: statusCor(servico.status) }}>
                  → {acao.link.label}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Definição dos serviços ───────────────────────────────────────────────────

const SERVICOS_BASE: Pick<ServicoStatus, 'nome' | 'descricao' | 'icon'>[] = [
  { nome: 'Supabase',      descricao: 'Banco de dados principal e autenticação',       icon: Database },
  { nome: 'Evolution API', descricao: 'Gateway WhatsApp — envio e recebimento',        icon: Zap },
  { nome: 'Upstash Redis', descricao: 'Rate limiting e proteção contra abusos',        icon: Server },
  { nome: 'OpenAI',        descricao: 'Motor de IA principal dos agentes',             icon: Bot },
  { nome: 'Anthropic',     descricao: 'Motor de IA backup dos agentes',                icon: Cloud },
  { nome: 'Vercel',        descricao: 'Hospedagem e deploy da aplicação',              icon: Activity },
]

// ─── Página principal ─────────────────────────────────────────────────────────

export default function StatusPage() {
  const [servicos, setServicos] = useState<ServicoStatus[]>(
    SERVICOS_BASE.map(s => ({ ...s, status: 'verificando', latencia: null, detalhe: 'Aguardando...', acoes: [] }))
  )
  const [ultimaVerificacao, setUltimaVerificacao] = useState<Date | null>(null)
  const [verificando, setVerificando] = useState(false)

  const verificarTodos = useCallback(async () => {
    setVerificando(true)
    setServicos(prev => prev.map(s => ({ ...s, status: 'verificando', detalhe: 'Verificando...', acoes: [] })))

    const [supabase, evolution, redis, openai, anthropic] = await Promise.all([
      verificarSupabase(),
      verificarEvolution(),
      verificarRedis(),
      verificarOpenAI(),
      verificarAnthropic(),
    ])

    const vercel: Omit<ServicoStatus, 'nome' | 'descricao' | 'icon' | 'acoes'> = {
      status: 'ok', latencia: null, detalhe: 'Aplicação rodando normalmente',
    }

    const resultados = [supabase, evolution, redis, openai, anthropic, vercel]

    setServicos(SERVICOS_BASE.map((base, i) => ({
      ...base,
      ...resultados[i],
      acoes: ACOES[base.nome]?.[resultados[i].status] ?? [],
    })))

    setUltimaVerificacao(new Date())
    setVerificando(false)
  }, [])

  useEffect(() => {
    verificarTodos()
    const interval = setInterval(verificarTodos, 60000)
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
    statusGeral === 'erro'      ? `${totalErro} serviço(s) com falha. Clique no serviço afetado para ver o que fazer.` :
    'Verificando serviços...'

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Painel Administrativo</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Status do Sistema</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Monitoramento em tempo real. Clique em um serviço com falha para ver o que fazer.
          </p>
        </div>
        <button onClick={verificarTodos} disabled={verificando}
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
          <StatusIcon status={statusGeral} size={20} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {statusGeral === 'ok'        ? 'Sistema operacional' :
               statusGeral === 'degradado' ? 'Sistema com degradação' :
               statusGeral === 'erro'      ? 'Falha detectada' : 'Verificando...'}
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
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Serviços monitorados — clique em um serviço com falha para ver orientações
        </h2>
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {servicos.map((s, i) => (
            <ServicoCard key={s.nome} servico={s} index={i} total={servicos.length} />
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Como interpretar os status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { status: 'ok'        as StatusLevel, titulo: 'Operacional', desc: 'Funcionando normalmente. Nenhuma ação necessária.' },
            { status: 'degradado' as StatusLevel, titulo: 'Degradado',   desc: 'Lento ou instável. Monitore. Clique para ver orientações.' },
            { status: 'erro'      as StatusLevel, titulo: 'Falha',       desc: 'Inacessível. Clique no serviço para ver o que fazer.' },
          ]).map(item => (
            <div key={item.status} className="rounded-lg p-3"
              style={{ background: statusBg(item.status), border: `1px solid ${statusCor(item.status)}25` }}>
              <div className="flex items-center gap-2 mb-1">
                <StatusIcon status={item.status} />
                <p className="text-xs font-semibold" style={{ color: statusCor(item.status) }}>{item.titulo}</p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs pt-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
          A verificação é automática a cada 60 segundos. Para suporte técnico avançado, acione o desenvolvedor com o nome do serviço afetado e o horário da falha.
        </p>
      </div>

    </div>
  )
}
