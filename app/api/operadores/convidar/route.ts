import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
      .select('role, tenant_id, nome')
      .eq('id', user.id)
      .single()

    if (!usuarioAtual) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    const rolesPermitidos = ['admin_hubtek', 'admin_tenant', 'self_managed']
    if (!rolesPermitidos.includes(usuarioAtual.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const { email, nome, tenant_id } = body

    if (!email || !nome) {
      return NextResponse.json({ error: 'Email e nome são obrigatórios' }, { status: 400 })
    }

    const tenantAlvo = usuarioAtual.role === 'admin_hubtek' ? tenant_id : usuarioAtual.tenant_id

    if (!tenantAlvo) {
      return NextResponse.json({ error: 'tenant_id inválido' }, { status: 400 })
    }

    // Verificar limite de 3 operadores ativos
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantAlvo)
      .eq('role', 'operador')
      .eq('ativo', true)

    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: 'Limite de 3 operadores atingido' }, { status: 400 })
    }

    // Verificar se e-mail já existe neste tenant
    const { data: existente } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenantAlvo)
      .eq('email', email.toLowerCase())
      .single()

    if (existente) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado neste tenant' }, { status: 400 })
    }

    // Buscar dados do tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('nome')
      .eq('id', tenantAlvo)
      .single()

    const senhaProvisoria = gerarSenhaProvisoria()

    // Criar usuário no Supabase Auth via service role
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: senhaProvisoria,
      email_confirm: true,
      user_metadata: { nome, tenant_id: tenantAlvo, role: 'operador' }
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Este e-mail já possui uma conta no sistema' }, { status: 400 })
      }
      return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 500 })
    }

    // O trigger handle_new_user já inseriu o registro com id, email e role='operador'
    // Apenas complementar os campos que o trigger não preenche
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({
        tenant_id: tenantAlvo,
        role: 'operador',
        nome,
        ativo: true,
        senha_provisoria: true
      })
      .eq('id', authUser.user.id)

    if (userError) {
      // Rollback: remover do Auth
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json({
        error: `DB error: ${userError.message} | code: ${userError.code} | details: ${userError.details}`
      }, { status: 500 })
    }

    // Enviar e-mail via Resend
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: 'Hubtek Solutions <noreply@hubteksolutions.tech>',
      to: email.toLowerCase(),
      subject: `Você foi adicionado como operador — ${tenant?.nome ?? 'Hubtek'}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9f9f9; border-radius: 8px;">
          <h2 style="color: #111; margin-bottom: 8px;">Olá, ${nome}!</h2>
          <p style="color: #444; line-height: 1.6;">
            Você foi cadastrado como <strong>operador</strong> na plataforma <strong>Hubtek Solutions</strong>
            ${tenant?.nome ? `para a empresa <strong>${tenant.nome}</strong>` : ''}.
          </p>
          <p style="color: #444; line-height: 1.6;">Use as credenciais abaixo para acessar o sistema:</p>
          <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px;"><strong>E-mail:</strong> ${email.toLowerCase()}</p>
            <p style="margin: 0;"><strong>Senha provisória:</strong> <span style="font-family: monospace; font-size: 16px; color: #333;">${senhaProvisoria}</span></p>
          </div>
          <p style="color: #444; line-height: 1.6;">Ao entrar pela primeira vez, você será solicitado a definir uma nova senha.</p>
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
    console.error('[convidar-operador]', err)
    return NextResponse.json({ error: `Erro interno: ${String(err)}` }, { status: 500 })
  }
}
