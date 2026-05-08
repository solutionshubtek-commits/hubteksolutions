'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageCircle, Search } from 'lucide-react'

interface Conversa {
  id: string
  contato_nome: string
  contato_telefone: string
  status: string
  ultima_mensagem_em: string
}

export default function ConversasPage() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  useEffect(() => {
    async function fetchConversas() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) return
      const { data } = await supabase.from('conversations')
        .select('id, contato_nome, contato_telefone, status, ultima_mensagem_em')
        .eq('tenant_id', userData.tenant_id)
        .order('ultima_mensagem_em', { ascending: false })
      setConversas(data || [])
      setCarregando(false)
    }
    fetchConversas()
  }, [])

  const conversasFiltradas = conversas.filter((c) => {
    const matchBusca = c.contato_nome?.toLowerCase().includes(busca.toLowerCase()) || c.contato_telefone?.includes(busca)
    const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus
    return matchBusca && matchStatus
  })

  function statusBadge(status: string) {
    const map: Record<string, { label: string; color: string }> = {
      ativa:      { label: 'Ativa',      color: '#10B981' },
      pausada:    { label: 'Pausada',    color: '#F59E0B' },
      encerrada:  { label: 'Encerrada', color: '#71717A' },
    }
    const s = map[status] || { label: status, color: '#71717A' }
    return (
      <span className="text-xs font-medium px-2.5 py-1 rounded-full"
        style={{ color: s.color, backgroundColor: s.color + '20' }}>
        {s.label}
      </span>
    )
  }

  function formatarData(data: string) {
    if (!data) return '-'
    return new Date(data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  function iniciais(nome: string) {
    if (!nome) return '?'
    return nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Conversas</h1>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="rounded-lg px-3 py-2.5 text-sm focus:outline-none"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="todos">Todos</option>
          <option value="ativa">Ativas</option>
          <option value="pausada">Pausadas</option>
          <option value="encerrada">Encerradas</option>
        </select>
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
            <MessageCircle size={40} className="mb-3" />
            <p className="text-sm">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Contato', 'Telefone', 'Status', 'Última Mensagem'].map(h => (
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
                        style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                        {iniciais(c.contato_nome)}
                      </div>
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{c.contato_nome || 'Sem nome'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{c.contato_telefone}</td>
                  <td className="px-6 py-4">{statusBadge(c.status)}</td>
                  <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{formatarData(c.ultima_mensagem_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
