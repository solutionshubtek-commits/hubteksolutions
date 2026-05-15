import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function gerarSenhaProvisoria(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let senha = ''
  for (let i = 0; i < 10; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return senha
}

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

    // Buscar operador
    const { data: operador } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id, role, email, nome')
      .eq('id', operador_id)
      .single()

    if (!operador) return NextResponse.json({ error: 'Operador não encontrado' }, { status: 404 })
    if (operador.role !== 'operador') return NextResponse.json({ error: 'Usuário não é operador' }, { status: 400 })

    // admin_hubtek pode reenviar para qualquer tenant; outros só do próprio
    if (usuarioAtual.role !== 'admin_hubtek' && operador.tenant_id !== usuarioAtual.tenant_id) {
      return NextResponse.json({ error: 'Sem permissão para este operador' }, { status: 403 })
    }

    const novaSenha = gerarSenhaProvisoria()

    // Atualizar senha no Auth
    await supabaseAdmin.auth.admin.updateUserById(operador_id, {
      password: novaSenha
    })

    // Marcar como senha provisória novamente
    await supabaseAdmin
      .from('users')
      .update({ senha_provisoria: true })
      .eq('id', operador_id)

    // Buscar nome do tenant
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('nome')
      .eq('id', operador.tenant_id)
      .single()

    // Enviar e-mail via Resend
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: 'Hubtek Solutions <noreply@hubteksolutions.tech>',
      to: operador.email,
      subject: 'Nova senha provisória — Hubtek Solutions',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9f9f9; border-radius: 8px;">
          <h2 style="color: #111; margin-bottom: 8px;">Olá, ${operador.nome}!</h2>
          <p style="color: #444; line-height: 1.6;">
            Uma nova senha provisória foi gerada para o seu acesso à plataforma
            <strong>Hubtek Solutions</strong>${tenant?.nome ? ` — ${tenant.nome}` : ''}.
          </p>
          <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px;"><strong>E-mail:</strong> ${operador.email}</p>
            <p style="margin: 0;"><strong>Nova senha provisória:</strong> <span style="font-family: monospace; font-size: 16px; color: #333;">${novaSenha}</span></p>
          </div>
          <p style="color: #444; line-height: 1.6;">Ao entrar, você será solicitado a definir uma nova senha.</p>
          <a href="https://app.hubteksolutions.tech/login"
             style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">
            Acessar plataforma
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">Hubtek Solutions · suporte: wa.me/5551980104924</p>
        </div>
      `
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reenviar-senha-operador]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
