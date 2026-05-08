'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Sun, Moon, Bell, Pause, Play, AlertTriangle } from 'lucide-react'

interface HeaderProps {
  nomeUsuario: string | null
}

export function Header({ nomeUsuario }: HeaderProps) {
  const router = useRouter()
  const [agentAtivo, setAgentAtivo] = useState(true)
  const [pausadoPorAdmin, setPausadoPorAdmin] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tema, setTema] = useState<'dark' | 'light'>('dark')
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    async function fetchAgentStatus() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase
        .from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) return
      setTenantId(userData.tenant_id)
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('agente_ativo, pausado_por_admin')
        .eq('id', userData.tenant_id)
        .single()
      if (tenantData) {
        setAgentAtivo(tenantData.agente_ativo ?? true)
        setPausadoPorAdmin(tenantData.pausado_por_admin ?? false)
      }
    }
    fetchAgentStatus()

    const temaSalvo = localStorage.getItem('hubtek-tema') as 'dark' | 'light' | null
    if (temaSalvo) {
      setTema(temaSalvo)
      document.documentElement.setAttribute('data-theme', temaSalvo)
    }
  }, [])

  async function handleToggleAgent() {
    // Bloqueado pelo admin — não permite reativar
    if (pausadoPorAdmin) return
    if (!tenantId || toggling) return
    setToggling(true)
    const novoEstado = !agentAtivo
    const supabase = createClient()
    await supabase.from('tenants').update({
      agente_ativo: novoEstado,
      agente_pausado_em: novoEstado ? null : new Date().toISOString(),
    }).eq('id', tenantId)
    setAgentAtivo(novoEstado)
    setToggling(false)
  }

  function handleToggleTema() {
    const novoTema = tema === 'dark' ? 'light' : 'dark'
    setTema(novoTema)
    localStorage.setItem('hubtek-tema', novoTema)
    document.documentElement.setAttribute('data-theme', novoTema)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = nomeUsuario
    ? nomeUsuario.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
    : 'U'

  return (
    <header className="h-16 bg-[#0A0A0A] border-b border-[#1F1F1F] flex items-center justify-end px-8 gap-3 sticky top-0 z-30">

      {/* Aviso pausado por admin */}
      {pausadoPorAdmin && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 border border-red-500/40 text-red-400">
          <AlertTriangle size={11} />
          <span>Agente suspenso · entre em contato com a HubTek Solutions</span>
        </div>
      )}

      {/* Toggle Agente Global — oculto se pausado por admin */}
      {!pausadoPorAdmin && (
        <button
          onClick={handleToggleAgent}
          disabled={toggling}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all disabled:opacity-50 ${
            agentAtivo
              ? 'bg-[#10B981]/10 border-[#10B981]/40 text-[#10B981] hover:bg-[#10B981]/20'
              : 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20'
          }`}
        >
          <span className="relative flex h-2 w-2">
            {agentAtivo && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${agentAtivo ? 'bg-[#10B981]' : 'bg-red-400'}`} />
          </span>
          <span>Agente</span>
          <span className="font-bold">{agentAtivo ? 'Ativo' : 'Pausado'}</span>
          {agentAtivo ? <Pause size={11} /> : <Play size={11} />}
        </button>
      )}

      {/* Toggle tema */}
      <button
        onClick={handleToggleTema}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6B6B] hover:text-white hover:bg-[#1F1F1F] transition-colors"
        title={tema === 'dark' ? 'Modo claro' : 'Modo escuro'}
      >
        {tema === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Notificações */}
      <button className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6B6B] hover:text-white hover:bg-[#1F1F1F] transition-colors relative">
        <Bell size={16} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#10B981]" />
      </button>

      <div className="w-px h-6 bg-[#1F1F1F]" />

      {/* Usuário */}
      <div className="flex items-center gap-2">
        <span className="text-[#A3A3A3] text-sm hidden md:block">{nomeUsuario}</span>
        <div className="w-8 h-8 rounded-full bg-[#1F1F1F] border border-[#2A2A2A] flex items-center justify-center text-white text-xs font-semibold">
          {initials}
        </div>
      </div>

      {/* Sair */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-[#6B6B6B] hover:text-white text-sm transition-colors"
      >
        <LogOut size={15} />
        <span className="hidden md:block">Sair</span>
      </button>
    </header>
  )
}