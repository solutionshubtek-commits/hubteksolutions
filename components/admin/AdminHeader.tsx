'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Sun, Moon, Bell } from 'lucide-react'

export function AdminHeader({ nomeUsuario }: { nomeUsuario: string | null }) {
  const router = useRouter()
  const [clientesAtivos, setClientesAtivos] = useState<number | null>(null)
  const [clientesTotal, setClientesTotal]   = useState<number | null>(null)
  const [tema, setTema]                     = useState<'dark' | 'light'>('dark')

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
    const temaSalvo = localStorage.getItem('hubtek-tema') as 'dark' | 'light' | null
    if (temaSalvo) {
      setTema(temaSalvo)
      document.documentElement.setAttribute('data-theme', temaSalvo)
    }
  }, [])

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

      <button className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative"
        style={{ color: 'var(--text-muted)' }}>
        <Bell size={16} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#10B981]" />
      </button>

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
