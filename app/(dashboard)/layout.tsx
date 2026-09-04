import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { Header } from '@/components/dashboard/Header'
import { SidebarProvider } from '@/contexts/SidebarContext'
import { AvisoCicloDeVida } from '@/components/dashboard/AvisoCicloDeVida'
import { motivoBloqueio } from '@/lib/ciclo-vida'

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
    .select('nome, avatar_url, senha_provisoria, role, tenant_id')
    .eq('id', user.id)
    .single()

  if (userData?.senha_provisoria) redirect('/trocar-senha')

  // Ciclo de vida do cliente. A checagem é feita aqui, no layout, para que o
  // aviso apareça em TODA página da dashboard sem que cada uma precise repetir
  // a consulta — e do lado do servidor, junto do dado que já é buscado.
  //
  // O operador não passa por aqui com o acesso bloqueado: o middleware o desvia
  // para /acesso-expirado antes. Quem vê este card é o gestor, que continua
  // entrando de propósito — é ele quem renova.
  let bloqueio: ReturnType<typeof motivoBloqueio> = null
  let expiraEm: string | null = null

  if (userData?.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('expira_em, status_comercial')
      .eq('id', userData.tenant_id)
      .single()

    if (tenant) {
      bloqueio = motivoBloqueio(tenant)
      expiraEm = tenant.expira_em
    }
  }

  const podeRenovar = userData?.role === 'admin_tenant' || userData?.role === 'self_managed'

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
            {bloqueio && (
              <AvisoCicloDeVida motivo={bloqueio} expiraEm={expiraEm} podeRenovar={podeRenovar} />
            )}
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
