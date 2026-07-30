import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { exigirAdminHubtek } from '@/lib/auth/admin'

// Papéis que esta rota pode atribuir. `admin_hubtek` fica DE FORA de propósito:
// a rota roda com service role e recebia `role` direto do corpo, então aceitar
// esse valor permitiria criar um administrador da Hubtek por chamada de API.
// Admin da plataforma se cria no banco, não por formulário.
const ROLES_PERMITIDOS = ['admin_tenant', 'self_managed', 'operador']

// Mesmos funis de lib/crm.ts e do PROMPT_COMPLEMENTAR em process-message.ts.
const FUNIS_VALIDOS = ['vendas', 'suporte', 'agendamentos', 'qualificacao']

/**
 * Prompt inicial do agente.
 *
 * Deliberadamente genérico e curto: serve para o agente atender de forma
 * coerente desde a primeira mensagem, não para substituir o prompt real que o
 * time escreve na tela de Treinamento. O texto diz isso ao próprio modelo — sem
 * a base de conhecimento carregada ele deve admitir que não sabe, em vez de
 * inventar detalhes sobre um negócio que ninguém descreveu ainda.
 */
function promptInicial(nomeEmpresa: string): string {
  return `Você é o assistente virtual de ${nomeEmpresa}, atendendo clientes pelo WhatsApp.

Atenda de forma cordial, objetiva e em português do Brasil. Use as informações da base de conhecimento para responder.

Se a informação pedida não estiver na base de conhecimento, diga com naturalidade que vai confirmar esse detalhe com a equipe — nunca invente preços, prazos, endereços ou condições.

Não prometa nada que você não possa confirmar pelas informações disponíveis.`
}

export async function POST(request: Request) {
  try {
    const guarda = await exigirAdminHubtek()
    if (guarda.erro) return guarda.erro

    const { email, senha, tenant_id, role, nome, slug, funcao, instancias } = await request.json()

    if (!email || !senha || !tenant_id || !role) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    if (!ROLES_PERMITIDOS.includes(role)) {
      return NextResponse.json({ error: `Papel inválido: ${role}` }, { status: 400 })
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
        // Prompt inicial funcional em vez de string vazia. Com prompt vazio o
        // agente respondia sem persona nem regra de negócio até alguém abrir a
        // tela de treinamento — e nada avisava que isso estava pendente.
        prompt_principal: promptInicial(nome ?? 'a empresa'),
        // Funil escolhido no cadastro. Antes nascia vazio, o que desligava o
        // prompt complementar E a classificação de CRM: a aba CRM não populava
        // lead nenhum, porque classificarEtapaCRM exige um funil válido.
        funcoes_ativas: FUNIS_VALIDOS.includes(funcao) ? [funcao] : ['vendas'],
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
          headers: {
            'Content-Type': 'application/json',
            // Chamada servidor-a-servidor não carrega cookie de sessão; o
            // segredo interno é o que autentica este salto.
            'x-internal-secret': process.env.CRON_SECRET ?? '',
          },
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