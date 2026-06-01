'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, MessageSquare, History, Smartphone, Settings, ArrowRight, RefreshCw, X, Calendar } from 'lucide-react'
import { useSidebar } from '@/contexts/SidebarContext'

const WHATSAPP_SUPORTE = 'https://wa.me/5551980104924?text=Ol%C3%A1%2C+preciso+de+suporte+HubTek'
const ROLES_PLANO  = ['admin_hubtek', 'admin_tenant', 'self_managed']
const ROLES_CONFIG = ['admin_hubtek', 'admin_tenant', 'self_managed']

const ITEMS_BASE = [
  { href: '/visao-geral',        label: 'Visão Geral',        icon: LayoutDashboard },
  { href: '/conversas',          label: 'Conversas',          icon: MessageSquare },
  { href: '/historico',          label: 'Histórico',          icon: History },
  { href: '/agendamentos',       label: 'Agendamentos',       icon: Calendar },
  { href: '/reconexao-whatsapp', label: 'Reconexão WhatsApp', icon: Smartphone },
]

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
}

export function Sidebar() {
  const pathname = usePathname()
  const { open, setOpen } = useSidebar()
  const [role, setRole]               = useState<string | null>(null)
  const [nomeEmpresa, setNomeEmpresa] = useState<string>('')
  const [avatarUrl, setAvatarUrl]     = useState<string | null>(null)
  const [tema, setTema]               = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('hubtek-tema') as 'dark' | 'light' | null
    if (saved) setTema(saved)

    const observer = new MutationObserver(() => {
      const current = document.documentElement.getAttribute('data-theme')
      setTema(current === 'light' ? 'light' : 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('users').select('role, tenant_id').eq('id', user.id).single()
        .then(({ data: userData }) => {
          setRole(userData?.role ?? null)
          if (!userData?.tenant_id) return
          supabase.from('tenants')
            .select('nome, avatar_url')
            .eq('id', userData.tenant_id)
            .single()
            .then(({ data: tenantData }) => {
              if (tenantData) {
                setNomeEmpresa(tenantData.nome ?? '')
                setAvatarUrl((tenantData as { nome: string; avatar_url?: string | null }).avatar_url ?? null)
              }
            })
        })
    })
  }, [])

  useEffect(() => { setOpen(false) }, [pathname, setOpen])

  const mostrarPlano  = role !== null && ROLES_PLANO.includes(role)
  const mostrarConfig = role !== null && ROLES_CONFIG.includes(role)

  function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
    const active = pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        href={href}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 border-l-2"
        style={{
          background:  active ? 'rgba(16,185,129,0.05)' : 'transparent',
          color:       active ? 'var(--text-primary)'   : 'var(--text-secondary)',
          borderColor: active ? '#10B981'               : 'transparent',
          fontWeight:  active ? 600                     : 400,
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}}
      >
        <Icon size={16} />
        <span>{label}</span>
      </Link>
    )
  }

  const sidebarContent = (
    <aside
      className="flex flex-col h-full w-60"
      style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}
    >
      {/* Logo + fechar (mobile) */}
      <div className="h-16 flex items-center justify-between px-5">
        <Image
          src={tema === 'light' ? '/logo-black.png' : '/logo-verde.png'}
          alt="Hubtek Agents"
          width={160}
          height={32}
          priority
        />
        <button
          onClick={() => setOpen(false)}
          className="md:hidden p-1 rounded-lg"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Avatar + nome empresa */}
      {nomeEmpresa && (
        <div className="flex items-center gap-3 px-4 pb-3">
          {avatarUrl ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={nomeEmpresa} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10B981' }}>
              {getInitials(nomeEmpresa)}
            </div>
          )}
          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {nomeEmpresa}
          </span>
        </div>
      )}

      {/* Label */}
      <div className="px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold tracking-widest uppercase px-1"
          style={{ color: 'var(--text-label)' }}>Menu</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {ITEMS_BASE.map(item => <NavLink key={item.href} {...item} />)}
        {mostrarConfig && <NavLink href="/configuracoes"  label="Configurações" icon={Settings}  />}
        {mostrarPlano  && <NavLink href="/renovar-plano"  label="Renovar Plano" icon={RefreshCw} />}
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

        {/* Termos e Privacidade */}
        <div className="flex items-center gap-3 mt-3 px-1 flex-wrap">
          <Link
            href="/termos"
            className="text-[11px] transition-colors"
            style={{ color: pathname === '/termos' ? '#10B981' : 'var(--text-label)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#10B981'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = pathname === '/termos' ? '#10B981' : 'var(--text-label)'}
          >
            Termos de Uso
          </Link>
          <span className="text-[11px]" style={{ color: 'var(--text-label)' }}>·</span>
          <Link
            href="/privacidade"
            className="text-[11px] transition-colors"
            style={{ color: pathname === '/privacidade' ? '#10B981' : 'var(--text-label)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#10B981'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = pathname === '/privacidade' ? '#10B981' : 'var(--text-label)'}
          >
            Privacidade
          </Link>
        </div>

        {/* Copyright */}
        <p className="text-[10px] mt-2 px-1" style={{ color: 'var(--text-label)' }}>
          © {new Date().getFullYear()} Hubtek Agents
        </p>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop: sidebar fixa */}
      <div className="hidden md:fixed md:flex md:left-0 md:top-0 md:h-full md:w-60 md:z-40">
        {sidebarContent}
      </div>

      {/* Mobile: drawer + overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full z-50 md:hidden" style={{ width: 240 }}>
            {sidebarContent}
          </div>
        </>
      )}
    </>
  )
}