'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, MessageCircle, Smartphone, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [instancias, setInstancias] = useState<Record<string, string>>({})
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

  const conversasFiltradas = conversas.filter((c) => {
    const matchBusca = c.contato_nome?.toLowerCase().includes(busca.toLowerCase()) || c.contato_telefone?.includes(busca)
    const matchStatus = filtroStatus === 'todos' || 
  (filtroStatus === 'ativa' && (c.status === 'ativa' || c.status === 'ativo')) ||
  (filtroStatus === 'encerrada' && (c.status === 'encerrada' || c.status === 'encerrado'))
    return matchBusca && matchStatus
  })

  function formatarData(data: string) {
    if (!data) return ''
    const d = new Date(data)
    const hoje = new Date()
    const isHoje = d.toDateString() === hoje.toDateString()
    if (isHoje) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  function iniciais(nome: string) {
    if (!nome) return '?'
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div className="flex h-[calc(100vh-64px)]" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm flex flex-col border-r" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>

        {/* Header */}
        <div className="px-4 pt-5 pb-3">
          <h1 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Conversas</h1>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar conversa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex gap-1">
            {['todos', 'ativa', 'encerrada'].map(f => (
              <button key={f} onClick={() => setFiltroStatus(f)}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize"
                style={{
                  background: filtroStatus === f ? '#10B98118' : 'transparent',
                  color: filtroStatus === f ? '#10B981' : 'var(--text-muted)',
                  border: filtroStatus === f ? '1px solid #10B98130' : '1px solid transparent',
                }}>
                {f === 'todos' ? 'Todas' : f === 'ativa' ? 'Ativas' : 'Encerradas'}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {carregando ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full animate-pulse" style={{ background: 'var(--bg-hover)' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded animate-pulse w-32" style={{ background: 'var(--bg-hover)' }} />
                    <div className="h-2.5 rounded animate-pulse w-48" style={{ background: 'var(--bg-hover)' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : conversasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
              <MessageCircle size={32} className="mb-2" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            conversasFiltradas.map((c) => {
              const apelido = c.instance_name ? instancias[c.instance_name] : null
              return (
                <button key={c.id} onClick={() => router.push(`/conversas/${c.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                    style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                    {iniciais(c.contato_nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {c.contato_nome || c.contato_telefone}
                      </span>
                      <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
                        {formatarData(c.ultima_mensagem_em)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {apelido && (
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: '#818CF8' }}>
                          <Smartphone size={9} />{apelido}
                        </span>
                      )}
                      {c.agente_pausado ? (
                        <span className="text-[10px] font-medium" style={{ color: '#F59E0B' }}>● Pausado</span>
                      ) : (c.status === 'ativa' || c.status === 'ativo') ? (
                        <span className="text-[10px] font-medium" style={{ color: '#10B981' }}>● Ativo</span>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Encerrada</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Placeholder quando nenhuma conversa selecionada */}
      <div className="flex-1 hidden md:flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <MessageCircle size={48} className="mb-3 opacity-30" />
        <p className="text-sm opacity-50">Selecione uma conversa para visualizar</p>
      </div>
    </div>
  )
}
