import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { Header } from '@/components/dashboard/Header'
import { SidebarProvider } from '@/contexts/SidebarContext'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('nome, avatar_url, senha_provisoria')
    .eq('id', user.id)
    .single()

  if (userData?.senha_provisoria) redirect('/trocar-senha')

  const nomeUsuario = userData?.nome ?? user.email ?? null
  const avatarUrl = (userData as { nome?: string; avatar_url?: string | null; senha_provisoria?: boolean | null } | null)?.avatar_url ?? null

  return (
    <SidebarProvider>
      <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
        <Sidebar />
        {/* Em desktop empurra o conteúdo 240px para a direita; em mobile ocupa tela cheia */}
        <div className="md:ml-60 flex flex-col min-h-screen">
          <Header nomeUsuario={nomeUsuario} avatarUrl={avatarUrl} />
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
