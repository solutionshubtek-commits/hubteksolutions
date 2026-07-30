import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Guarda das rotas administrativas.
 *
 * Todas as rotas em /api/admin usam a SERVICE_ROLE_KEY, que ignora RLS por
 * definição. Sem checagem de sessão, elas ficavam abertas a qualquer requisição
 * da internet — e `criar-usuario` aceita o campo `role` do corpo, então dava
 * para criar uma conta `admin_hubtek` sem credencial nenhuma. `resetar-senha`
 * permitia trocar a senha de qualquer usuário. Escalonamento de privilégio
 * completo em duas chamadas.
 *
 * Uso:
 *   const guarda = await exigirAdminHubtek()
 *   if (guarda.erro) return guarda.erro
 *   // ... guarda.userId disponível
 */
export async function exigirAdminHubtek(): Promise<
  { erro: NextResponse; userId?: undefined } | { erro?: undefined; userId: string }
> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'admin_hubtek') {
    return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }

  return { userId: user.id }
}

/**
 * Variante para rotas que também são chamadas servidor-a-servidor.
 *
 * `criar-instancia-evolution` é chamada pelo navegador (admin cadastrando um
 * cliente) E por `criar-usuario` via fetch interno, que não carrega cookie de
 * sessão. Exigir só sessão quebraria o cadastro; aceitar só o segredo deixaria
 * a rota aberta ao navegador. Aceita os dois.
 */
export async function exigirAdminOuSegredoInterno(
  request: Request
): Promise<{ erro: NextResponse } | { erro?: undefined }> {
  const segredo = request.headers.get('x-internal-secret')
  if (segredo && process.env.CRON_SECRET && segredo === process.env.CRON_SECRET) {
    return {}
  }

  const guarda = await exigirAdminHubtek()
  if (guarda.erro) return { erro: guarda.erro }
  return {}
}
