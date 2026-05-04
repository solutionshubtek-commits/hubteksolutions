'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  MessageCircle,
  History,
  Smartphone,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const itens = [
  { href: '/visao-geral',          label: 'Visão Geral',   icone: LayoutDashboard },
  { href: '/conversas',            label: 'Conversas',     icone: MessageCircle },
  { href: '/historico',            label: 'Histórico',     icone: History },
  { href: '/reconexao-whatsapp',   label: 'WhatsApp',      icone: Smartphone },
  { href: '/configuracoes',        label: 'Configurações', icone: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 h-screen bg-[#0A0A0A] border-r border-[#1F1F1F] flex flex-col fixed top-0 left-0 z-20">
      <div className="h-16 flex items-center px-6 border-b border-[#1F1F1F]">
        <Image
          src="/logo-horizontal.png"
          alt="Hubtek Solutions"
          width={120}
          height={24}
          priority
        />
      </div>

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
    </aside>
  )
}
