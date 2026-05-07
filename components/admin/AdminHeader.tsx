'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Sun, Moon, Bell } from 'lucide-react'

export function AdminHeader({ nomeUsuario }: { nomeUsuario: string | null }) {
  const router = useRouter()
  const [clientesAtivos, setClientesAtivos] = useState<number | null>(null)
  const [clientesTotal, setClientesTotal] = useState<number | null>(null)
  const [tema, setTema] = useState<'dark' | 'light'>('dark')

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
    <header className="h-16 bg-[#0A0A0A] border-b border-[#1F1F1F] flex items-center justify-end px-8 gap-4 sticky top-0 z-30">

      {/* Clientes ativos */}
      {clientesAtivos !== null && (
        <div className="flex flex-col items-end gap-0.5 pr-4 border-r border-[#1F1F1F] mr-1">
          <span className="text-[#6B6B6B] text-[10px] font-semibold uppercase tracking-widest">Clientes ativos</span>
          <span className="text-white text-sm font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-[0_0_6px_#10B981]" />
            {clientesAtivos} / {clientesTotal}
          </span>
        </div>
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

      {/* Avatar + nome */}
      <div className="flex items-center gap-2">
        <span className="text-[#A3A3A3] text-sm hidden md:block">{nomeUsuario}</span>
        <div className="w-8 h-8 rounded-full bg-[#10B981]/10 border border-[#10B981]/40 flex items-center justify-center text-[#10B981] text-xs font-semibold">
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
