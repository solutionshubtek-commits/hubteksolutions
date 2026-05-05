'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { History, Search } from 'lucide-react'

interface Conversa {
  id: string
  contato_nome: string
  contato_telefone: string
  status: string
  criado_em: string
  ultima_mensagem_em: string
}

export default function HistoricoPage() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  useEffect(() => {
    async function fetchHistorico() {
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
        .select('id, contato_nome, contato_telefone, status, criado_em, ultima_mensagem_em')
        .eq('tenant_id', userData.tenant_id)
        .eq('status', 'encerrada')
        .order('ultima_mensagem_em', { ascending: false })
      setConversas(data || [])
      setCarregando(false)
    }
    fetchHistorico()
  }, [])

  const conversasFiltradas = conversas.filter((c) => {
    const matchBusca =
      c.contato_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      c.contato_telefone?.includes(busca)
    const matchInicio = dataInicio ? new Date(c.criado_em) >= new Date(dataInicio) : true
    const matchFim = dataFim ? new Date(c.criado_em) <= new Date(dataFim + 'T23:59:59') : true
    return matchBusca && matchInicio && matchFim
  })

  function formatarData(data: string) {
    if (!data) return '-'
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  }

  function iniciais(nome: string) {
    if (!nome) return '?'
    return nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Histórico</h1>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
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
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="bg-[#0A0A0A] border border-[#1F1F1F] text-[#A3A3A3] rounded-lg px-3 py-2.5
            text-sm focus:outline-none focus:border-[#10B981]"
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="bg-[#0A0A0A] border border-[#1F1F1F] text-[#A3A3A3] rounded-lg px-3 py-2.5
            text-sm focus:outline-none focus:border-[#10B981]"
        />
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
            <History size={40} className="mb-3" />
            <p className="text-sm">Nenhum histórico encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1F1F1F]">
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3">CONTATO</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3">TELEFONE</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3">INÍCIO</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-6 py-3">ENCERRAMENTO</th>
              </tr>
            </thead>
            <tbody>
              {conversasFiltradas.map((c, i) => (
                <tr key={c.id} className={`border-b border-[#1F1F1F] hover:bg-[#141414] transition-colors ${i === conversasFiltradas.length - 1 ? 'border-b-0' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#6B6B6B]/20 flex items-center justify-center text-[#A3A3A3] text-xs font-semibold">
                        {iniciais(c.contato_nome)}
                      </div>
                      <span className="text-white text-sm">{c.contato_nome || 'Sem nome'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[#A3A3A3] text-sm">{c.contato_telefone}</td>
                  <td className="px-6 py-4 text-[#A3A3A3] text-sm">{formatarData(c.criado_em)}</td>
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
