import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { Header } from '@/components/dashboard/Header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('nome')
    .eq('id', user.id)
    .single()

  const nomeUsuario = userData?.nome ?? user.email ?? null

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <Sidebar />
      <div className="ml-60 flex flex-col min-h-screen">
        <Header nomeUsuario={nomeUsuario} />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
