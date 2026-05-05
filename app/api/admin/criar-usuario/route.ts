import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, senha, tenant_id, role, nome } = await request.json()

    if (!email || !senha || !tenant_id || !role) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    // Usa service role key para criar usuário sem precisar de convite
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Criar auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? 'Erro ao criar auth user.' }, { status: 400 })
    }

    // 2. Inserir na tabela users
    const { error: userErr } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      email,
      nome: nome ?? email,
      tenant_id,
      role,
    })

    if (userErr) {
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: userErr.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, user_id: authData.user.id })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
