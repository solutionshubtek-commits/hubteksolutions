'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import {
  LayoutDashboard, MessageSquare, History,
  Smartphone, Settings, ArrowRight,
} from 'lucide-react'

const WHATSAPP_SUPORTE = 'https://wa.me/5551980104924?text=Ol%C3%A1%2C+preciso+de+suporte+HubTek'

const items = [
  { href: '/visao-geral',          label: 'Visão Geral',        icon: LayoutDashboard },
  { href: '/conversas',            label: 'Conversas',          icon: MessageSquare },
  { href: '/historico',            label: 'Histórico',          icon: History },
  { href: '/reconexao-whatsapp',   label: 'Reconexão WhatsApp', icon: Smartphone },
  { href: '/configuracoes',        label: 'Configurações',      icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#0A0A0A] border-r border-[#1F1F1F] flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#1F1F1F]">
        <Image
          src="/logo-horizontal.png"
          alt="HUBTEK SOLUTIONS"
          width={100}
          height={20}
          priority
        />
      </div>

      {/* Nav */}
      <div className="px-3 pt-3 pb-1">
        <span className="text-[#404040] text-[10px] font-semibold tracking-widest uppercase px-1">Menu</span>
      </div>
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 border-l-2 ${
                active
                  ? 'bg-[#10B981]/5 text-white font-medium border-[#10B981]'
                  : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414] border-transparent'
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Card de suporte */}
      <div className="p-4 border-t border-[#1F1F1F]">
        <div className="bg-[#050505] border border-[#1F1F1F] rounded-xl p-4">
          <p className="text-white text-xs font-semibold mb-1">Precisa de ajuda?</p>
          <p className="text-[#6B6B6B] text-xs leading-relaxed mb-3">
            Fale com nosso time. Respondemos em minutos no próprio WhatsApp.
          </p>
          <a
            href={WHATSAPP_SUPORTE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[#10B981] text-xs font-medium hover:underline"
          >
            Abrir suporte <ArrowRight size={11} />
          </a>
        </div>
      </div>
    </aside>
  )
}
