import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

/**
 * Guarda das rotas do cliente (fora de /api/admin).
 *
 * Devolve o tenant do usuário LOGADO. As rotas nunca devem aceitar tenant_id
 * vindo do corpo ou da query: quem informa o próprio tenant consegue ler saldo
 * alheio e, pior, gastar crédito de outro cliente. O tenant sai da sessão.
 *
 * Uso:
 *   const guarda = await exigirUsuarioComTenant()
 *   if (guarda.erro) return guarda.erro
 *   // guarda.tenantId / guarda.userId / guarda.role disponíveis
 */
export async function exigirUsuarioComTenant(opcoes?: {
  /** Quando informado, recusa quem não estiver na lista. */
  papeis?: UserRole[]
}): Promise<
  | { erro: NextResponse; userId?: undefined; tenantId?: undefined; role?: undefined }
  | { erro?: undefined; userId: string; tenantId: string; role: UserRole }
> {
  const supabase = createClient()

  // getUser revalida o token no Supabase; getSession apenas decodifica o
  // cookie e não serve como barreira no servidor.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  }

  const { data } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()

  const registro = data as { role?: UserRole; tenant_id?: string } | null
  if (!registro?.tenant_id) {
    return { erro: NextResponse.json({ error: 'Usuário sem cliente vinculado' }, { status: 403 }) }
  }

  const role = registro.role as UserRole
  if (opcoes?.papeis && !opcoes.papeis.includes(role)) {
    return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }

  return { userId: user.id, tenantId: registro.tenant_id, role }
}
