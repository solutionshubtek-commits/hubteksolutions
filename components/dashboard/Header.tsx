'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Sun, Moon, Bell, Pause, Play, AlertTriangle, X, Check, TrendingUp } from 'lucide-react'

interface HeaderProps { nomeUsuario: string | null }

interface Notification {
  id: string
  titulo: string
  mensagem: string
  lida: boolean
  criado_em: string
}

interface LimiteInfo {
  totalConversas: number
  limite: number
  percentual: number
  plano: string
  emAviso: boolean
  atingiuLimite: boolean
}

export function Header({ nomeUsuario }: HeaderProps) {
  const router = useRouter()
  const [agentAtivo, setAgentAtivo]           = useState(true)
  const [pausadoPorAdmin, setPausadoPorAdmin]  = useState(false)
  const [tenantId, setTenantId]               = useState<string | null>(null)
  const [tema, setTema]                       = useState<'dark' | 'light'>('dark')
  const [toggling, setToggling]               = useState(false)
  const [notifications, setNotifications]     = useState<Notification[]>([])
  const [showDropdown, setShowDropdown]       = useState(false)
  const [expiraEm, setExpiraEm]               = useState<string | null>(null)
  const [limiteInfo, setLimiteInfo]           = useState<LimiteInfo | null>(null)
  const dropdownRef                           = useRef<HTMLDivElement>(null)

  const naoLidas = notifications.filter(n => !n.lida).length

  // Banner de expiração
  const bannerExpiracao = (() => {
    if (!expiraEm) return null
    const hoje = new Date()
    const expira = new Date(expiraEm)
    const diff = Math.round((expira.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    if (diff <= 1 && diff >= 0) return { dias: diff, urgente: true }
    if (diff <= 7 && diff >= 0) return { dias: diff, urgente: false }
    return null
  })()

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) return
      setTenantId(userData.tenant_id)
      const { data: tenantData } = await supabase.from('tenants')
        .select('agente_ativo, pausado_por_admin, expira_em').eq('id', userData.tenant_id).single()
      if (tenantData) {
        setAgentAtivo(tenantData.agente_ativo ?? true)
        setPausadoPorAdmin(tenantData.pausado_por_admin ?? false)
        setExpiraEm(tenantData.expira_em ?? null)
      }

      // Verifica limite de conversas (cria notificação se necessário)
      try {
        const res = await fetch('/api/notifications/limite-conversas', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data.emAviso || data.atingiuLimite) {
            setLimiteInfo(data)
          }
        }
      } catch {
        // silencioso — não bloqueia o carregamento
      }
    }

    fetchData()
    fetchNotifications()

    const temaSalvo = localStorage.getItem('hubtek-tema') as 'dark' | 'light' | null
    if (temaSalvo) {
      setTema(temaSalvo)
      document.documentElement.setAttribute('data-theme', temaSalvo)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchNotifications() {
    const res = await fetch('/api/notifications')
    const data = await res.json()
    if (data.notifications) setNotifications(data.notifications)
  }

  async function marcarLida(id: string) {
    await fetch('/api/notifications/marcar-lida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
  }

  async function marcarTodasLidas() {
    await fetch('/api/notifications/marcar-lida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'all' }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, lida: true })))
  }

  async function handleToggleAgent() {
    if (pausadoPorAdmin || !tenantId || toggling) return
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
    <>
      {/* Banner expiração */}
      {bannerExpiracao && (
        <div className={`w-full px-6 py-2.5 flex items-center justify-center gap-2 text-sm font-medium ${
          bannerExpiracao.urgente
            ? 'bg-red-500/10 border-b border-red-500/30 text-red-400'
            : 'bg-orange-500/10 border-b border-orange-500/30 text-orange-400'
        }`}>
          <AlertTriangle size={14} />
          {bannerExpiracao.dias === 0
            ? 'Seu acesso expira hoje! Entre em contato para renovar.'
            : bannerExpiracao.dias === 1
            ? 'Seu acesso expira amanhã! Entre em contato para renovar.'
            : `Seu acesso expira em ${bannerExpiracao.dias} dias. Renove para não perder o serviço.`
          }
          <a href="https://wa.me/5551980104924?text=Ol%C3%A1%2C+preciso+renovar+meu+acesso+HubTek"
            target="_blank" rel="noopener noreferrer"
            className="underline font-semibold ml-1">
            Falar com suporte
          </a>
        </div>
      )}

      {/* Banner limite de conversas */}
      {limiteInfo && !bannerExpiracao && (
        <div className={`w-full px-6 py-2.5 flex items-center justify-center gap-2 text-sm font-medium ${
          limiteInfo.atingiuLimite
            ? 'bg-red-500/10 border-b border-red-500/30 text-red-400'
            : 'bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-400'
        }`}>
          <TrendingUp size={14} />
          {limiteInfo.atingiuLimite
            ? `Limite de conversas atingido (${limiteInfo.totalConversas}/${limiteInfo.limite}). Seu plano foi atualizado automaticamente.`
            : `${limiteInfo.percentual}% do limite de conversas usado este mês — ${limiteInfo.totalConversas} de ${limiteInfo.limite} (Plano ${limiteInfo.plano}).`
          }
          <a href="https://wa.me/5551980104924?text=Ol%C3%A1%2C+quero+fazer+upgrade+do+meu+plano+HubTek"
            target="_blank" rel="noopener noreferrer"
            className="underline font-semibold ml-1">
            {limiteInfo.atingiuLimite ? 'Falar com suporte' : 'Fazer upgrade'}
          </a>
        </div>
      )}

      <header className="h-16 flex items-center justify-end px-8 gap-3 sticky top-0 z-30"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>

        {pausadoPorAdmin && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 border border-red-500/40 text-red-400">
            <AlertTriangle size={11} />
            <span>Agente suspenso · entre em contato com a HubTek Solutions</span>
          </div>
        )}

        {!pausadoPorAdmin && (
          <button onClick={handleToggleAgent} disabled={toggling}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all disabled:opacity-50 ${
              agentAtivo
                ? 'bg-[#10B981]/10 border-[#10B981]/40 text-[#10B981] hover:bg-[#10B981]/20'
                : 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20'
            }`}>
            <span className="relative flex h-2 w-2">
              {agentAtivo && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${agentAtivo ? 'bg-[#10B981]' : 'bg-red-400'}`} />
            </span>
            <span>Agente</span>
            <span className="font-bold">{agentAtivo ? 'Ativo' : 'Pausado'}</span>
            {agentAtivo ? <Pause size={11} /> : <Play size={11} />}
          </button>
        )}

        <button onClick={handleToggleTema}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          title={tema === 'dark' ? 'Modo claro' : 'Modo escuro'}>
          {tema === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Sininho */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => { setShowDropdown(prev => !prev); if (!showDropdown) fetchNotifications() }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            <Bell size={16} />
            {naoLidas > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                {naoLidas > 9 ? '9+' : naoLidas}
              </span>
            )}
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-10 w-80 rounded-xl shadow-2xl z-50 overflow-hidden"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notificações</span>
                {naoLidas > 0 && (
                  <button onClick={marcarTodasLidas} className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <Check size={12} /> Marcar todas como lidas
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    Nenhuma notificação
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id}
                      className="px-4 py-3 flex gap-3 items-start transition-colors"
                      style={{
                        background: n.lida ? 'transparent' : n.tipo === 'limite_conversas' ? 'rgba(234,179,8,0.05)' : 'rgba(249,115,22,0.05)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{n.titulo}</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{n.mensagem}</p>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          {new Date(n.criado_em).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      {!n.lida && (
                        <button onClick={() => marcarLida(n.id)} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-6" style={{ background: 'var(--border)' }} />

        <div className="flex items-center gap-2">
          <span className="text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>{nomeUsuario}</span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-2)', color: 'var(--text-primary)' }}>
            {initials}
          </div>
        </div>

        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
          <LogOut size={15} />
          <span className="hidden md:block">Sair</span>
        </button>
      </header>
    </>
  )
}
