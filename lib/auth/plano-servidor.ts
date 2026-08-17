import { createClient } from '@/lib/supabase/server'

export interface AcessoDoUsuario {
  plano: string | null
  /** Prazo da cortesia de recursos, se houver. Ver migration 012. */
  cortesiaAte: string | null
}

/**
 * Plano e cortesia do tenant do usuário logado, para uso em Server Components.
 *
 * Existe separado de `exigirUsuarioComTenant` porque aquele devolve
 * NextResponse, que serve a route handlers e não a RSC. Aqui o retorno é o
 * dado puro, e quem chama decide o que renderizar.
 *
 * Devolve plano `null` quando não há sessão ou tenant. Quem consome deve
 * tratar isso como "sem acesso": o middleware já barra quem não está logado,
 * então cair aqui significa estado inesperado — e o lado seguro é não liberar.
 */
export async function acessoDoUsuarioLogado(): Promise<AcessoDoUsuario> {
  const vazio: AcessoDoUsuario = { plano: null, cortesiaAte: null }
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return vazio

  const { data: usuario } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  const tenantId = (usuario as { tenant_id?: string } | null)?.tenant_id
  if (!tenantId) return vazio

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('plano, cortesia_recursos_ate')
    .eq('id', tenantId)
    .single()

  // Rede de proteção de ordem de deploy, no mesmo espírito de
  // isTenantAgentActive: se o código subir antes da migration 012, a coluna
  // não existe, o PostgREST devolve erro e `tenant` vem nulo — o que barraria
  // o CRM de TODO mundo de uma vez. Neste caso recai na consulta antiga e
  // segue só com o plano, sem cortesia.
  if (error) {
    const { data: legado } = await supabase
      .from('tenants')
      .select('plano')
      .eq('id', tenantId)
      .single()

    return {
      plano: (legado as { plano?: string } | null)?.plano ?? null,
      cortesiaAte: null,
    }
  }

  const t = tenant as { plano?: string; cortesia_recursos_ate?: string | null } | null
  return {
    plano: t?.plano ?? null,
    cortesiaAte: t?.cortesia_recursos_ate ?? null,
  }
}
