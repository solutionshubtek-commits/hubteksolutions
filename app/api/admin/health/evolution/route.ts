import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verificarInstancias } from '@/lib/evolution/saude'

export async function GET() {
  // Verifica autenticação — apenas admin_hubtek
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userData?.role !== 'admin_hubtek') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  // A checagem antiga parava em "a API respondeu?" e contava quantas instâncias
  // existiam, chamando o número de "instâncias ativas". Não era ativas: era
  // cadastradas. A Evolution ficou de pé e respondendo enquanto a instância de
  // um cliente estava fora do ar por dois dias, e este painel exibiu
  // "Operacional" o tempo inteiro. Quem entrega mensagem é a instância, não o
  // serviço — então é o estado dela que precisa ser verificado.
  try {
    const saude = await verificarInstancias()
    return NextResponse.json({
      ok: saude.desconectadas.length === 0,
      total: saude.total,
      conectadas: saude.conectadas,
      desconectadas: saude.desconectadas,
      instancias: saude.total,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 })
  }
}
