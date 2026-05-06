import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { tenant_id, nova_senha } = await request.json()

    if (!tenant_id || !nova_senha) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    if (nova_senha.length < 8) {
      return NextResponse.json({ error: 'Senha deve ter no mínimo 8 caracteres.' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Busca o usuário admin do tenant
    const { data: userData, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('tenant_id', tenant_id)
      .in('role', ['admin_tenant', 'self_managed'])
      .single()

    if (userErr || !userData) {
      return NextResponse.json({ error: 'Usuário não encontrado para este tenant.' }, { status: 404 })
    }

    const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(
      userData.id,
      { password: nova_senha }
    )

    if (resetErr) {
      return NextResponse.json({ error: resetErr.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
