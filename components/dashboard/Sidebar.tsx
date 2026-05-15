'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, MessageSquare, History, Smartphone, Settings, ArrowRight, RefreshCw } from 'lucide-react'

const WHATSAPP_SUPORTE = 'https://wa.me/5551980104924?text=Ol%C3%A1%2C+preciso+de+suporte+HubTek'
const ROLES_PLANO = ['admin_hubtek', 'admin_tenant', 'self_managed']
const ROLES_CONFIG = ['admin_hubtek', 'admin_tenant', 'self_managed']

const ITEMS_BASE = [
  { href: '/visao-geral',        label: 'Visão Geral',        icon: LayoutDashboard },
  { href: '/conversas',          label: 'Conversas',          icon: MessageSquare },
  { href: '/historico',          label: 'Histórico',          icon: History },
  { href: '/reconexao-whatsapp', label: 'Reconexão WhatsApp', icon: Smartphone },
]

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
}

export function Sidebar() {
  const pathname = usePathname()
  const [role, setRole] = useState<string | null>(null)
  const [nomeEmpresa, setNomeEmpresa] = useState<string>('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

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

  const mostrarPlano = role !== null && ROLES_PLANO.includes(role)
  const mostrarConfig = role !== null && ROLES_CONFIG.includes(role)

  function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
    const active = pathname === href || pathname.startsWith(href + '/')
    return (
      <Link href={href}
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

  return (
    <aside className="fixed left-0 top-0 h-full w-60 flex flex-col z-40"
      style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}>

      {/* Logo Hubtek */}
      <div className="h-16 flex items-center px-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <Image
          src="/logo-horizontal.png"
          alt="HUBTEK SOLUTIONS"
          width={100}
          height={20}
          priority
          style={{ filter: 'var(--logo-filter)' }}
        />
      </div>

      {/* Avatar + nome da empresa */}
      {nomeEmpresa && (
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
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

        {mostrarConfig && (
          <NavLink href="/configuracoes" label="Configurações" icon={Settings} />
        )}

        {mostrarPlano && (
          <NavLink href="/renovar-plano" label="Renovar Plano" icon={RefreshCw} />
        )}
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
