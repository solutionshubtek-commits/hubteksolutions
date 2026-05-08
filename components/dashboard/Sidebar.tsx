'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { LayoutDashboard, MessageSquare, History, Smartphone, Settings, ArrowRight } from 'lucide-react'

const WHATSAPP_SUPORTE = 'https://wa.me/5551980104924?text=Ol%C3%A1%2C+preciso+de+suporte+HubTek'

const items = [
  { href: '/visao-geral',        label: 'Visão Geral',        icon: LayoutDashboard },
  { href: '/conversas',          label: 'Conversas',          icon: MessageSquare },
  { href: '/historico',          label: 'Histórico',          icon: History },
  { href: '/reconexao-whatsapp', label: 'Reconexão WhatsApp', icon: Smartphone },
  { href: '/configuracoes',      label: 'Configurações',      icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="fixed left-0 top-0 h-full w-60 flex flex-col z-40"
      style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}>

      {/* Logo */}
      <div className="h-16 flex items-center px-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <Image src="/logo-horizontal.png" alt="HUBTEK SOLUTIONS" width={100} height={20} priority />
      </div>

      {/* Label */}
      <div className="px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold tracking-widest uppercase px-1"
          style={{ color: 'var(--text-label)' }}>Menu</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 border-l-2"
              style={{
                background:   active ? 'rgba(16,185,129,0.05)' : 'transparent',
                color:        active ? 'var(--text-primary)'   : 'var(--text-secondary)',
                borderColor:  active ? '#10B981'               : 'transparent',
                fontWeight:   active ? 600                     : 400,
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Suporte */}
      <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Precisa de ajuda?</p>
          <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
            Fale com nosso time. Respondemos em minutos no próprio WhatsApp.
          </p>
          <a href={WHATSAPP_SUPORTE} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[#10B981] text-xs font-medium hover:underline">
            Abrir suporte <ArrowRight size={11} />
          </a>
        </div>
      </div>
    </aside>
  )
}
