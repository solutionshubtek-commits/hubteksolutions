// app/api/conta/alterar-senha/route.ts
// Permite que QUALQUER usuário autenticado altere a PRÓPRIA senha.
// Exige a senha atual (reautenticação) e nunca aceita um id de outro usuário —
// o alvo é sempre extraído da sessão, jamais do body.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const MIN_SENHA = 8

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json() as { senha_atual?: string; nova_senha?: string }
    const senhaAtual = body.senha_atual ?? ''
    const novaSenha  = body.nova_senha ?? ''

    if (!senhaAtual || !novaSenha) {
      return NextResponse.json({ error: 'Informe a senha atual e a nova senha.' }, { status: 400 })
    }
    if (novaSenha.length < MIN_SENHA) {
      return NextResponse.json({ error: `A nova senha deve ter no mínimo ${MIN_SENHA} caracteres.` }, { status: 400 })
    }
    if (novaSenha === senhaAtual) {
      return NextResponse.json({ error: 'A nova senha deve ser diferente da atual.' }, { status: 400 })
    }

    // ── Reautenticação ────────────────────────────────────────────────────────
    // Cliente temporário e isolado: valida a senha atual sem mexer nos cookies
    // da sessão em curso (persistSession: false).
    const verificador = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const { error: authError } = await verificador.auth.signInWithPassword({
      email: user.email,
      password: senhaAtual,
    })

    if (authError) {
      return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 401 })
    }

    // ── Atualização ───────────────────────────────────────────────────────────
    // O id vem SEMPRE da sessão — impossível alterar a senha de terceiros.
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: novaSenha,
    })

    if (updateError) {
      console.error('[conta/alterar-senha] updateUserById falhou:', updateError.message)
      return NextResponse.json({ error: 'Erro ao atualizar a senha. Tente novamente.' }, { status: 500 })
    }

    // Se era senha provisória, deixa de ser
    await supabaseAdmin
      .from('users')
      .update({ senha_provisoria: false })
      .eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[conta/alterar-senha]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}