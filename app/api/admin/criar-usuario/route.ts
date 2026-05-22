import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, senha, tenant_id, role, nome, slug, instancias } = await request.json()

    if (!email || !senha || !tenant_id || !role) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Verificar e-mail duplicado em public.users
    const { data: emailExiste } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (emailExiste) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado no sistema.' }, { status: 400 })
    }

    // 2. Verificar e-mail duplicado no Auth
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers()
    const emailNoAuth = authList?.users?.find(u => u.email === email)
    if (emailNoAuth) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado no sistema.' }, { status: 400 })
    }

    // 3. Criar auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? 'Erro ao criar auth user.' }, { status: 400 })
    }

    // 4. UPSERT na tabela users
    const { error: userErr } = await supabaseAdmin.from('users').upsert({
      id: authData.user.id,
      email,
      nome: nome ?? email,
      tenant_id,
      role,
    }, { onConflict: 'id' })

    if (userErr) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: userErr.message }, { status: 400 })
    }

    // 5. Criar agent_config padrão — só se ainda não existir
    const { data: configExiste } = await supabaseAdmin
      .from('agent_config')
      .select('tenant_id')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (!configExiste) {
      const { error: configErr } = await supabaseAdmin.from('agent_config').insert({
        tenant_id,
        ativo: true,
        motor_ia_principal: 'openai',
        motor_ia_backup: 'anthropic',
        temperatura: 0.7,
        max_tokens: 1000,
        horario_inicio: '08:00',
        horario_fim: '18:00',
        dias_funcionamento: ['seg', 'ter', 'qua', 'qui', 'sex'],
        mensagem_ausencia: 'Olá! No momento estamos fora do horário de atendimento. Em breve retornaremos. 😊',
        prompt_principal: '',
        funcoes_ativas: [],
      })
      if (configErr) {
        console.error('[criar-usuario] Falha ao criar agent_config (não crítico):', configErr.message)
      }
    }

    // 6. Onboarding Evolution API
    if (slug && Array.isArray(instancias) && instancias.length > 0) {
      try {
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.hubteksolutions.tech'
        const onboardingRes = await fetch(`${APP_URL}/api/admin/criar-instancia-evolution`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id, instancias }),
        })
        if (!onboardingRes.ok) {
          const err = await onboardingRes.json().catch(() => ({}))
          console.error('Onboarding Evolution falhou (usuário criado com sucesso):', err)
        }
      } catch (onboardingErr) {
        console.error('Erro ao chamar onboarding Evolution:', onboardingErr)
      }
    }

    return NextResponse.json({ success: true, user_id: authData.user.id })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}