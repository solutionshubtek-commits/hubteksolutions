'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { History, Search, ClipboardList, Bot, Pause, Play, MessageSquare, Paperclip } from 'lucide-react'

interface Conversa {
  id: string
  contato_nome: string
  contato_telefone: string
  status: string
  criado_em: string
  ultima_mensagem_em: string
}

interface ConversationLog {
  id: string
  acao: string
  descricao: string
  contato_nome: string | null
  criado_em: string
  user_id: string | null
  users: { nome: string } | null
}

const ACAO_CONFIG: Record<string, { icon: React.ElementType; cor: string; label: string }> = {
  pausou_ia:        { icon: Pause,         cor: '#F59E0B', label: 'Pausou agente' },
  retomou_ia:       { icon: Play,          cor: '#10B981', label: 'Retomou agente' },
  enviou_mensagem:  { icon: MessageSquare, cor: '#818CF8', label: 'Enviou mensagem' },
  enviou_midia:     { icon: Paperclip,     cor: '#818CF8', label: 'Enviou mídia' },
}

function tempoRelativo(data: string) {
  const diff = Math.floor((Date.now() - new Date(data).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  return new Date(data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function HistoricoPage() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [logs, setLogs] = useState<ConversationLog[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoLogs, setCarregandoLogs] = useState(true)
  const [busca, setBusca] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [buscarLog, setBuscarLog] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTudo() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id, role')
        .eq('id', user.id)
        .single()
      if (!userData?.tenant_id) return
      setUserRole(userData.role)

      // Conversas encerradas
      const { data: convData } = await supabase
        .from('conversations')
        .select('id, contato_nome, contato_telefone, status, criado_em, ultima_mensagem_em')
        .eq('tenant_id', userData.tenant_id)
        .eq('status', 'encerrada')
        .order('ultima_mensagem_em', { ascending: false })
      setConversas(convData || [])
      setCarregando(false)

      // Logs — só para gestores e admins
      if (['admin_hubtek', 'admin_tenant', 'self_managed'].includes(userData.role)) {
        const { data: logsData } = await supabase
          .from('conversation_logs')
          .select('id, acao, descricao, contato_nome, criado_em, user_id, users:user_id(nome)')
          .eq('tenant_id', userData.tenant_id)
          .order('criado_em', { ascending: false })
          .limit(100)
        setLogs((logsData as unknown as ConversationLog[]) || [])
      }
      setCarregandoLogs(false)
    }
    fetchTudo()
  }, [])

  const conversasFiltradas = conversas.filter((c) => {
    const matchBusca = c.contato_nome?.toLowerCase().includes(busca.toLowerCase()) || c.contato_telefone?.includes(busca)
    const matchInicio = dataInicio ? new Date(c.criado_em) >= new Date(dataInicio) : true
    const matchFim = dataFim ? new Date(c.criado_em) <= new Date(dataFim + 'T23:59:59') : true
    return matchBusca && matchInicio && matchFim
  })

  const logsFiltrados = logs.filter(l => {
    if (!buscarLog) return true
    const termo = buscarLog.toLowerCase()
    return (
      l.descricao?.toLowerCase().includes(termo) ||
      l.contato_nome?.toLowerCase().includes(termo) ||
      l.users?.nome?.toLowerCase().includes(termo)
    )
  })

  function formatarData(data: string) {
    if (!data) return '-'
    return new Date(data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  function iniciais(nome: string) {
    if (!nome) return '?'
    return nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  const inputStyle = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  }

  const podeVerLogs = userRole && ['admin_hubtek', 'admin_tenant', 'self_managed'].includes(userRole)

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Histórico</h1>

      {/* ── Conversas encerradas ── */}
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none"
              style={inputStyle}
            />
          </div>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
        </div>

        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {carregando ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
              ))}
            </div>
          ) : conversasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
              <History size={40} className="mb-3" />
              <p className="text-sm">Nenhum histórico encontrado</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Contato', 'Telefone', 'Início', 'Encerramento'].map(h => (
                    <th key={h} className="text-left text-xs font-medium px-6 py-3 uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversasFiltradas.map((c, i) => (
                  <tr key={c.id}
                    className="transition-colors"
                    style={{ borderBottom: i === conversasFiltradas.length - 1 ? 'none' : '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
                          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                          {iniciais(c.contato_nome)}
                        </div>
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{c.contato_nome || 'Sem nome'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{c.contato_telefone}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{formatarData(c.criado_em)}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{formatarData(c.ultima_mensagem_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Log de ações ── só para gestores/admins ── */}
      {podeVerLogs && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={18} style={{ color: 'var(--text-secondary)' }} />
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Log de ações</h2>
            </div>
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Buscar no log..."
                value={buscarLog}
                onChange={(e) => setBuscarLog(e.target.value)}
                className="w-full rounded-lg pl-8 pr-4 py-2 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {carregandoLogs ? (
              <div className="p-6 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
                ))}
              </div>
            ) : logsFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
                <Bot size={32} className="mb-2" />
                <p className="text-sm">Nenhuma ação registrada</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {logsFiltrados.map(log => {
                  const cfg = ACAO_CONFIG[log.acao] ?? { icon: ClipboardList, cor: 'var(--text-muted)', label: log.acao }
                  const Icon = cfg.icon
                  const nomeOperador = (log.users as { nome: string } | null)?.nome ?? 'Operador'
                  return (
                    <div key={log.id}
                      className="flex items-start gap-3 px-5 py-3 transition-colors"
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: `${cfg.cor}18` }}>
                        <Icon size={13} color={cfg.cor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
                          {log.descricao}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-medium" style={{ color: cfg.cor }}>{cfg.label}</span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{nomeOperador}</span>
                        </div>
                      </div>
                      <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {tempoRelativo(log.criado_em)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
