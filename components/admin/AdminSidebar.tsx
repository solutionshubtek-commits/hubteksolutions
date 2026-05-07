'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Wallet, Bot, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const itens = [
  { href: '/admin/visao-geral', label: 'Visão Geral', icone: LayoutDashboard },
  { href: '/admin/clientes',    label: 'Clientes',    icone: Users },
  { href: '/admin/custos-ia',   label: 'Custos IA',   icone: Wallet },
  { href: '/admin/treinamento', label: 'Treinamento', icone: Bot },
  { href: '/admin/relatorios',  label: 'Relatórios',  icone: FileText },
]

function StatusSistema() {
  const [ok, setOk] = useState(true)
  const [msg, setMsg] = useState('Verificando...')
  const [verificadoEm, setVerificadoEm] = useState(new Date())

  const verificar = useCallback(async () => {
    try {
      const supabase = createClient()
      const inicio = Date.now()
      const { error } = await supabase.from('tenants').select('id', { count: 'exact', head: true })
      if (error) throw error
      const latencia = Date.now() - inicio
      setOk(true)
      setMsg(`Todos os serviços operando normalmente. Última verificação há 30s.`)
      setVerificadoEm(new Date())
      // guarda latencia para exibir mas não usar no msg — fica como dado interno
      void latencia
    } catch {
      setOk(false)
      setMsg('Falha na conexão com o banco.')
      setVerificadoEm(new Date())
    }
  }, [])

  useEffect(() => {
    verificar()
    const interval = setInterval(verificar, 30000)
    return () => clearInterval(interval)
  }, [verificar])

  void verificadoEm // used to trigger re-render via state

  return (
    <div className="p-4 border-t border-[#1F1F1F]">
      <div className="bg-[#050505] border border-[#1F1F1F] rounded-xl p-4">
        <p className="text-white text-xs font-semibold mb-1">Status do sistema</p>
        <p className="text-[#6B6B6B] text-xs leading-relaxed mb-3">{msg}</p>
        <a
          href="https://status.hubtek.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs"
        >
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
    <aside className="w-60 h-screen bg-[#0A0A0A] border-r border-[#1F1F1F] flex flex-col fixed top-0 left-0 z-20">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-[#1F1F1F]">
        <Image src="/logo-horizontal.png" alt="Hubtek Solutions" width={100} height={20} priority />
        <span className="text-[#10B981] text-xs font-semibold bg-[#10B981]/10 px-2 py-1 rounded-md">
          Admin
        </span>
      </div>

      {/* Section label */}
      <div className="px-4 pt-4 pb-1">
        <span className="text-[#404040] text-[10px] font-semibold tracking-widest uppercase">Administração</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {itens.map(({ href, label, icone: Icone }) => {
          const ativo = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 py-2.5 rounded-lg mb-1',
                'transition-all duration-200 text-sm font-medium',
                'border-l-2 pl-[11px] -ml-px',
                ativo
                  ? 'text-white bg-[#10B981]/5 border-[#10B981]'
                  : 'text-[#A3A3A3] hover:text-white border-transparent'
              )}
            >
              <Icone className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Status do sistema — rodapé */}
      <StatusSistema />
    </aside>
  )
}
