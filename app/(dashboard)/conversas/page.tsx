'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageCircle, Search, Smartphone, Pause, Play } from 'lucide-react'

interface Conversa {
  id: string
  contato_nome: string
  contato_telefone: string
  status: string
  agente_pausado: boolean
  ultima_mensagem_em: string
  instance_name: string | null
}

interface Instancia {
  instance_name: string
  apelido: string
}

export default function ConversasPage() {
  const [conversas, setConversas]       = useState<Conversa[]>([])
  const [instancias, setInstancias]     = useState<Record<string, string>>({})
  const [carregando, setCarregando]     = useState(true)
  const [busca, setBusca]               = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [pausando, setPausando]         = useState<string | null>(null)

  useEffect(() => {
    async function fetchConversas() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) return

      const { data: instData } = await supabase
        .from('tenant_instances')
        .select('instance_name, apelido')
        .eq('tenant_id', userData.tenant_id)

      if (instData) {
        const mapa: Record<string, string> = {}
        instData.forEach((i: Instancia) => { mapa[i.instance_name] = i.apelido })
        setInstancias(mapa)
      }

      const { data } = await supabase.from('conversations')
        .select('id, contato_nome, contato_telefone, status, agente_pausado, ultima_mensagem_em, instance_name')
        .eq('tenant_id', userData.tenant_id)
        .order('ultima_mensagem_em', { ascending: false })

      setConversas(data || [])
      setCarregando(false)
    }
    fetchConversas()
  }, [])

  async function handlePausarRetomar(conversa: Conversa) {
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

  const conversasFiltradas = conversas.filter((c) => {
    const matchBusca = c.contato_nome?.toLowerCase().includes(busca.toLowerCase()) || c.contato_telefone?.includes(busca)
    const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus
    return matchBusca && matchStatus
  })

  function statusBadge(c: Conversa) {
    if (c.agente_pausado) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" /> Pausado
        </span>
      )
    }
    const map: Record<string, { label: string; color: string }> = {
      ativa:     { label: 'Ativo',      color: '#10B981' },
      encerrada: { label: 'Encerrada', color: '#71717A' },
    }
    const s = map[c.status] || { label: c.status, color: '#71717A' }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
        style={{ color: s.color, backgroundColor: s.color + '15', border: `1px solid ${s.color}30` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
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
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="rounded-lg px-3 py-2.5 text-sm focus:outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="todos">Todos</option>
          <option value="ativa">Ativas</option>
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
                {['Contato', 'Número / Instância', 'Telefone', 'Status', 'Última Mensagem', 'Ações'].map(h => (
                  <th key={h} className="text-left text-xs font-medium px-6 py-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conversasFiltradas.map((c, i) => {
                const apelido = c.instance_name ? instancias[c.instance_name] : null
                return (
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
                    <td className="px-6 py-4">
                      {apelido ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(99,102,241,0.1)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.3)' }}>
                          <Smartphone size={10} />
                          {apelido}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{c.contato_telefone}</td>
                    <td className="px-6 py-4">{statusBadge(c)}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{formatarData(c.ultima_mensagem_em)}</td>
                    <td className="px-6 py-4">
                      {c.status !== 'encerrada' && (
                        <button
                          onClick={() => handlePausarRetomar(c)}
                          disabled={pausando === c.id}
                          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                            c.agente_pausado
                              ? 'bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 border border-[#10B981]/30'
                              : 'bg-[#F59E0B]/10 text-[#F59E0B] hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30'
                          }`}>
                          {c.agente_pausado ? <><Play size={11} /> Retomar</> : <><Pause size={11} /> Pausar</>}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
