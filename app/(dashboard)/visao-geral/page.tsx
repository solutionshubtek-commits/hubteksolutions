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
    { titul
