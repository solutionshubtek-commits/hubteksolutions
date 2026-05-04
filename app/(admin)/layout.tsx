import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Header } from '@/components/dashboard/Header'

export default async function AdminLayout({
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
    .select('nome, role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'admin_hubtek') {
    redirect('/visao-geral')
  }

  const nomeUsuario = userData?.nome ?? user.email ?? null

  return (
    <div className="min-h-screen bg-black">
      <AdminSidebar />
      <div className="ml-60 flex flex-col min-h-screen">
        <Header nomeUsuario={nomeUsuario} />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
