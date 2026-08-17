import { createClient } from '@/lib/supabase/server'

/**
 * Plano do tenant do usuário logado, para uso em Server Components.
 *
 * Existe separado de `exigirUsuarioComTenant` porque aquele devolve
 * NextResponse, que serve a route handlers e não a RSC. Aqui o retorno é o
 * dado puro, e quem chama decide o que renderizar.
 *
 * Devolve `null` quando não há sessão ou tenant. Quem consome deve tratar isso
 * como "sem acesso": o middleware já barra quem não está logado, então cair
 * aqui significa estado inesperado — e o lado seguro é não liberar.
 */
export async function planoDoUsuarioLogado(): Promise<string | null> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: usuario } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  const tenantId = (usuario as { tenant_id?: string } | null)?.tenant_id
  if (!tenantId) return null

  const { data: tenant } = await supabase
    .from('tenants')
    .select('plano')
    .eq('id', tenantId)
    .single()

  return (tenant as { plano?: string } | null)?.plano ?? null
}
