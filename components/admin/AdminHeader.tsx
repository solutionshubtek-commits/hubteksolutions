'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Sun, Moon, Bell, X, Check } from 'lucide-react'

interface Notification {
  id: string
  titulo: string
  mensagem: string
  lida: boolean
  criado_em: string
}

export function AdminHeader({ nomeUsuario }: { nomeUsuario: string | null }) {
  const router = useRouter()
  const [clientesAtivos, setClientesAtivos] = useState<number | null>(null)
  const [clientesTotal, setClientesTotal]   = useState<number | null>(null)
  const [tema, setTema]                     = useState<'dark' | 'light'>('dark')
  const [notifications, setNotifications]   = useState<Notification[]>([])
  const [showDropdown, setShowDropdown]     = useState(false)
  const dropdownRef                         = useRef<HTMLDivElement>(null)

  const naoLidas = notifications.filter(n => !n.lida).length

  useEffect(() => {
    async function fetchClientes() {
      const supabase = createClient()
      const { data } = await supabase.from('tenants').select('status')
      if (data) {
        setClientesAtivos(data.filter(t => t.status === 'ativo').length)
        setClientesTotal(data.length)
      }
    }
    fetchClientes()
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
    : 'AD'

  return (
    <header className="h-16 flex items-center justify-end px-8 gap-4 sticky top-0 z-30"
      style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>

      {clientesAtivos !== null && (
        <div className="flex flex-col items-end gap-0.5 pr-4 mr-1" style={{ borderRight: '1px solid var(--border)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Clientes ativos
          </span>
          <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-[0_0_6px_#10B981]" />
            {clientesAtivos} / {clientesTotal}
          </span>
        </div>
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
          onClick={() => setShowDropdown(prev => !prev)}
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
                      background: n.lida ? 'transparent' : 'rgba(249,115,22,0.05)',
                      borderBottom: '1px solid var(--border)'
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

      <div className="flex items-center gap-2">
        <span className="text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>{nomeUsuario}</span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', color: '#10B981' }}>
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
  )
}
