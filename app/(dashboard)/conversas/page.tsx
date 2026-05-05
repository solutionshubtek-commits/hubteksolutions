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
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (!userData?.tenant_id) return
      const { data } = await supabase
        .from('conversations')
        .select('id, contato_nome, contato_telefone, status, ultima_mensagem_em')
        .eq('tenant_id', userData.tenant_id)
        .order('ultima_mensagem_em', { ascending: false })
      setConversas(data || [])
      setCarregando(false)
    }
    fetchConversas()
  }, [])

  const conversasFiltradas = conversas.filter((c) => {
    const matchBusca =
      c.contato_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      c.contato_telefone?.includes(busca)
    const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus
    return matchBusca && matchStatus
  })

  function statusBadge(status: string) {
    const map: Record<string, { label: string; color: string }> = {
      ativa: { label: 'Ativa', color: '#10B981' },
      pausada: { label: 'Pausada', color: '#F59E0B' },
      encerrada: { label: 'Encerrada', color: '#6B6B6B' },
    }
    const s = map[status] || { label: status, color: '#6B6B6B' }
    return (
      <span
        className="text-xs font-medium px-2 py-1 rounded-full"
        style={{ color: s.color, backgroundColor: s.color + '20' }}
      >
        {s.label}
      </span>
    )
  }

  function formatarData(data: string) {
    if (!data) return '-'
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    })
  }

  function iniciais(nome: string) {
    if (!nome) return '?'
    return nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Conversas</h1>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[#1F1F1F] text-white placeholder-[#6B6B6B]
              rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="bg-[#0A0A0A] border border-[#1F1F1F] text-white rounded-lg px-3 py-2.5
            text-sm focus:outline-none focus:border-[#10B981]"
        >
          <option value="todos">Todos</option>
          <option value="ativa">Ativas</option>
          <option value="pausada">Pausadas</option>
          <option value="encerrada">Encerradas</option>
        </select>
      </div>

      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl overflow-hidden">
        {carregando ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-[#1F1F1F] rounded animate-pulse" />
            ))}
          </div>
        ) : conversasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#6B6B6B]">
            <MessageCircle size={40} className="mb-3" />
            <p className="text-sm">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1F1F1F]">
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3">CONTATO</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3">TELEFONE</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3">STATUS</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3">ÚLTIMA MENSAGEM</th>
              </tr>
            </thead>
            <tbody>
              {conversasFiltradas.map((c, i) => (
                <tr key={c.id} className={`border-b border-[#1F1F1F] hover:bg-[#141414] transition-colors ${i === conversasFiltradas.length - 1 ? 'border-b-0' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#10B981]/20 flex items-center justify-center text-[#10B981] text-xs font-semibold">
                        {iniciais(c.contato_nome)}
                      </div>
                      <span className="text-white text-sm">{c.contato_nome || 'Sem nome'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[#A3A3A3] text-sm">{c.contato_telefone}</td>
                  <td className="px-6 py-4">{statusBadge(c.status)}</td>
                  <td className="px-6 py-4 text-[#A3A3A3] text-sm">{formatarData(c.ultima_mensagem_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
