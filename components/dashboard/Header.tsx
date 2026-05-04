'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface HeaderProps {
  nomeUsuario?: string | null
}

export function Header({ nomeUsuario }: HeaderProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-16 bg-black border-b border-[#1F1F1F] flex items-center justify-end px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        {nomeUsuario && (
          <span className="text-[#A3A3A3] text-sm">{nomeUsuario}</span>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-[#A3A3A3] hover:text-white text-sm transition-colors duration-200"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </header>
  )
}
