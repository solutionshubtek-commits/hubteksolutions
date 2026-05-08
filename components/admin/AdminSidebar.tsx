'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, Users, Wallet, Bot, FileText } from 'lucide-react'

const itens = [
  { href: '/admin/visao-geral', label: 'Visão Geral', icone: LayoutDashboard },
  { href: '/admin/clientes',    label: 'Clientes',    icone: Users },
  { href: '/admin/custos-ia',   label: 'Custos IA',   icone: Wallet },
  { href: '/admin/treinamento', label: 'Treinamento', icone: Bot },
  { href: '/admin/relatorios',  label: 'Relatórios',  icone: FileText },
]

function StatusSistema() {
  const [ok, setOk]   = useState(true)
  const [msg, setMsg] = useState('Verificando...')

  const verificar = useCallback(async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('tenants').select('id', { count: 'exact', head: true })
      if (error) throw error
      setOk(true)
      setMsg('Todos os serviços operando normalmente.')
    } catch {
      setOk(false)
      setMsg('Falha na conexão com o banco.')
    }
  }, [])

  useEffect(() => {
    verificar()
    const interval = setInterval(verificar, 30000)
    return () => clearInterval(interval)
  }, [verificar])

  return (
    <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Status do sistema</p>
        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>{msg}</p>
        <a href="https://status.hubtek.io" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-[#10B981]' : 'bg-red-400'}`} />
          <span className={ok ? 'text-[#10B981]' : 'text-red-400'}>status.hubtek.io</span>
        </a>
      </div>
    </div>
  )
}

export function AdminSidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-60 h-screen flex flex-col fixed top-0 left-0 z-20"
      style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}>

      <div className="h-16 flex items-center justify-between px-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <Image src="/logo-horizontal.png" alt="Hubtek Solutions" width={100} height={20} priority />
        <span className="text-[#10B981] text-xs font-semibold bg-[#10B981]/10 px-2 py-1 rounded-md">Admin</span>
      </div>

      <div className="px-4 pt-4 pb-1">
        <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-label)' }}>
          Administração
        </span>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {itens.map(({ href, label, icone: Icone }) => {
          const ativo = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3 py-2.5 rounded-lg mb-1 transition-all duration-200 text-sm font-medium border-l-2 pl-[11px] -ml-px"
              style={{
                background:  ativo ? 'rgba(16,185,129,0.05)' : 'transparent',
                color:       ativo ? 'var(--text-primary)'   : 'var(--text-secondary)',
                borderColor: ativo ? '#10B981'               : 'transparent',
                fontWeight:  ativo ? 600                     : 400,
              }}>
              <Icone className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <StatusSistema />
    </aside>
  )
}
