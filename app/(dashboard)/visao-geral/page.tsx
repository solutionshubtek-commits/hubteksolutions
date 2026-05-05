'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageSquare, Users, CheckCircle, Clock } from 'lucide-react'

interface Metrics {
  totalConversas: number
  conversasAtivas: number
  mensagensHoje: number
  contatosUnicos: number
}

export default function VisaoGeralPage() {
  const [metrics, setMetrics] = useState<Metrics>({
    totalConversas: 0,
    conversasAtivas: 0,
    mensagensHoje: 0,
    contatosUnicos: 0,
  })
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function fetchMetrics() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (!userData?.tenant_id) return
      const tenantId = userData.tenant_id
      const [totalRes, ativasRes, mensagensRes, contatosRes] = await Promise.all([
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'ativa'),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('criado_em', new Date(new Date().setHours(0,0,0,0)).toISOString()),
        supabase.from('conversations').select('contato_telefone', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      ])
      setMetrics({
        totalConversas: totalRes.count || 0,
        conversasAtivas: ativasRes.count || 0,
        mensagensHoje: mensagensRes.count || 0,
        contatosUnicos: contatosRes.count || 0,
      })
      setCarregando(false)
    }
    fetchMetrics()
  }, [])

  const cards = [
    { titulo: 'Total de Conversas', valor: metrics.totalConversas, icone: MessageSquare, cor: '#10B981' },
    { titulo: 'Conversas Ativas', valor: metrics.conversasAtivas, icone: Clock, cor: '#3B82F6' },
    { titulo: 'Mensagens Hoje', valor: metrics.mensagensHoje, icone: CheckCircle, cor: '#8B5CF6' },
    { titulo: 'Contatos Únicos', valor: metrics.contatosUnicos, icone: Users, cor: '#F59E0B' },
  ]

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Visão Geral</h1>
      {carregando ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-[#1F1F1F] rounded mb-4 w-3/4" />
              <div className="h-8 bg-[#1F1F1F] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div key={card.titulo} className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm">{card.titulo}</p>
                <card.icone size={20} color={card.cor} />
              </div>
              <p className="text-white text-3xl font-bold">{card.valor}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
