// components/dashboard/StatusAtendimento.tsx
//
// Componente isolado — heartbeat + toggle de disponibilidade do operador.
//
// POR QUE COMPONENTE SEPARADO:
// O Header já é grande e é renderizado em todas as páginas da dashboard.
// Isolar a presença aqui evita reescrevê-lo inteiro e mantém a lógica em um
// só lugar. Como o Header aparece em toda a área logada, o heartbeat roda em
// qualquer tela onde o operador estiver.
//
// COMO USAR NO Header.tsx (2 linhas):
//   1. No topo:      import { StatusAtendimento } from './StatusAtendimento'
//   2. No JSX, logo antes do botão de tema:   <StatusAtendimento />
//
// Só renderiza para role = 'operador'. Para os demais perfis não devolve nada
// e nem dispara heartbeat — apenas operadores entram na oferta do agente.

'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Headphones, Coffee } from 'lucide-react'

const INTERVALO_HEARTBEAT_MS = 60_000 // 60s — janela de tolerância no banco é 2 min

type Status = 'disponivel' | 'ausente'

export function StatusAtendimento() {
  const [ehOperador, setEhOperador] = useState(false)
  const [status, setStatus]         = useState<Status>('disponivel')
  const [carregando, setCarregando] = useState(true)
  const [trocando, setTrocando]     = useState(false)

  // Evita heartbeat antes de sabermos que é operador
  const ativoRef = useRef(false)

  const enviarHeartbeat = useCallback(async (novoStatus?: Status) => {
    if (!ativoRef.current) return
    try {
      const res = await fetch('/api/conta/presenca', {
        method: 'POST',
        headers: novoStatus ? { 'Content-Type': 'application/json' } : undefined,
        body: novoStatus ? JSON.stringify({ status: novoStatus }) : undefined,
      })
      if (res.ok) {
        const json = await res.json() as { status?: Status }
        if (json.status) setStatus(json.status)
      }
    } catch {
      // Falha de rede não derruba a UI — o próximo ping tenta de novo.
      // A janela de 2 min no banco tolera perder um heartbeat.
    }
  }, [])

  // Descobre o perfil e o status atual
  useEffect(() => {
    let cancelado = false
    async function init() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from('users')
          .select('role, status_atendimento')
          .eq('id', user.id)
          .single()

        if (cancelado) return
        if (data?.role !== 'operador') return

        setEhOperador(true)
        ativoRef.current = true
        setStatus((data.status_atendimento as Status) ?? 'disponivel')
        enviarHeartbeat() // ping imediato ao abrir
      } catch (err) {
        console.error('[StatusAtendimento] init falhou:', err)
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }
    init()
    return () => { cancelado = true; ativoRef.current = false }
  }, [enviarHeartbeat])

  // Heartbeat periódico + ping ao voltar para a aba
  useEffect(() => {
    if (!ehOperador) return

    const timer = setInterval(() => enviarHeartbeat(), INTERVALO_HEARTBEAT_MS)

    // Aba em segundo plano faz o browser estrangular timers — ao voltar,
    // manda um ping na hora para não ficar fora da lista.
    function onVisibilidade() {
      if (document.visibilityState === 'visible') enviarHeartbeat()
    }
    document.addEventListener('visibilitychange', onVisibilidade)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilidade)
    }
  }, [ehOperador, enviarHeartbeat])

  async function handleToggle() {
    setTrocando(true)
    const novo: Status = status === 'disponivel' ? 'ausente' : 'disponivel'
    setStatus(novo) // otimista
    await enviarHeartbeat(novo)
    setTrocando(false)
  }

  if (carregando || !ehOperador) return null

  const disponivel = status === 'disponivel'

  return (
    <button
      onClick={handleToggle}
      disabled={trocando}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all disabled:opacity-50 ${
        disponivel
          ? 'bg-[#10B981]/10 border-[#10B981]/40 text-[#10B981] hover:bg-[#10B981]/20'
          : 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20'
      }`}
      title={
        disponivel
          ? 'Você está recebendo transferências do agente. Clique para ficar ausente.'
          : 'Você não está recebendo transferências. Clique para ficar disponível.'
      }
    >
      <span className="relative flex h-2 w-2">
        {disponivel && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${disponivel ? 'bg-[#10B981]' : 'bg-amber-400'}`} />
      </span>
      <span className="hidden sm:inline">{disponivel ? 'Disponível' : 'Ausente'}</span>
      {disponivel ? <Headphones size={11} /> : <Coffee size={11} />}
    </button>
  )
}