import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: usuarioAtual } = await supabase
      .from('users')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()

    if (!usuarioAtual) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    const rolesPermitidos = ['admin_hubtek', 'admin_tenant', 'self_managed']
    if (!rolesPermitidos.includes(usuarioAtual.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { operador_id } = await req.json()
    if (!operador_id) return NextResponse.json({ error: 'operador_id obrigatório' }, { status: 400 })

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Buscar operador para validar tenant
    const { data: operador } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id, role, email')
      .eq('id', operador_id)
      .single()

    if (!operador) return NextResponse.json({ error: 'Operador não encontrado' }, { status: 404 })
    if (operador.role !== 'operador') return NextResponse.json({ error: 'Usuário não é operador' }, { status: 400 })

    // admin_hubtek pode remover de qualquer tenant; outros só do próprio
    if (usuarioAtual.role !== 'admin_hubtek' && operador.tenant_id !== usuarioAtual.tenant_id) {
      return NextResponse.json({ error: 'Sem permissão para este operador' }, { status: 403 })
    }

    // Desativar na tabela users (soft delete)
    await supabaseAdmin
      .from('users')
      .update({ ativo: false })
      .eq('id', operador_id)

    // Desativar no Supabase Auth (ban)
    await supabaseAdmin.auth.admin.updateUserById(operador_id, {
      ban_duration: '876600h' // ~100 anos = efetivamente desativado
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[remover-operador]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
