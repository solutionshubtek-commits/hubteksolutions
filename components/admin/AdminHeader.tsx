'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export function AdminHeader({ nomeUsuario }: { nomeUsuario: string | null }) {
  const router = useRouter()

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
      <div className="flex items-center gap-3">
        <span className="text-[#A3A3A3] text-sm">{nomeUsuario}</span>
        <div className="w-8 h-8 rounded-full bg-[#10B981]/10 border border-[#10B981]/40 flex items-center justify-center text-[#10B981] text-xs font-semibold">
          {initials}
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-[#6B6B6B] hover:text-white text-sm transition-colors"
      >
        <LogOut size={15} />
        Sair
      </button>
    </header>
  )
}
