import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Liga/desliga o agente do tenant inteiro.
//
// Por que esta rota existe: o Header fazia `supabase.from('tenants').update(...)`
// direto do browser, mas a policy `tenants_update` só aceita admin_hubtek. Para
// o dono de um tenant (admin_tenant) o update era descartado pela RLS sem erro
// visível — o botão mudava de estado na tela e o agente continuava respondendo
// no WhatsApp. Na prática só a Hubtek conseguia pausar o agente de um cliente.
//
// A escrita passa a ser feita no servidor, com service client, depois de
// validar sessão, papel e posse do tenant. Preferi isto a afrouxar a policy:
// `tenants` guarda também `plano`, `status` e `expira_em`, que o cliente não
// pode alterar. Aqui só duas colunas são graváveis.

const ROLES_PERMITIDOS = ['admin_hubtek', 'admin_tenant', 'self_managed']

interface ToggleBody {
  ativo?: boolean
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: usuarioLogado } = await supabase
      .from('users')
      .select('role, tenant_id')
      .eq('id', session.user.id)
      .single()

    if (!usuarioLogado?.tenant_id) {
      return NextResponse.json({ error: 'Usuário sem tenant' }, { status: 404 })
    }

    if (!ROLES_PERMITIDOS.includes(usuarioLogado.role)) {
      return NextResponse.json(
        { error: 'Seu perfil não pode ligar ou desligar o agente' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as ToggleBody
    if (typeof body.ativo !== 'boolean') {
      return NextResponse.json(
        { error: 'Parâmetro inválido. Informe ativo (true|false)' },
        { status: 400 }
      )
    }

    const service = createServiceClient()

    const { data: tenant } = await service
      .from('tenants')
      .select('id, agente_ativo, pausado_por_admin')
      .eq('id', usuarioLogado.tenant_id)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
    }

    // Pausa administrativa da Hubtek continua sendo a palavra final: o cliente
    // pode desligar o próprio agente, mas não pode religá-lo por cima de um
    // bloqueio nosso (inadimplência, abuso, suporte em andamento).
    if (tenant.pausado_por_admin && usuarioLogado.role !== 'admin_hubtek') {
      return NextResponse.json(
        { error: 'O agente está pausado pela administração da Hubtek. Fale com o suporte.' },
        { status: 409 }
      )
    }

    const { data: atualizado, error } = await service
      .from('tenants')
      .update({
        agente_ativo: body.ativo,
        agente_pausado_em: body.ativo ? null : new Date().toISOString(),
      })
      .eq('id', usuarioLogado.tenant_id)
      .select('agente_ativo, agente_pausado_em, pausado_por_admin')
      .single()

    if (error) throw error

    return NextResponse.json({ data: atualizado })
  } catch (error) {
    console.error('[POST /api/agent/toggle-global]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
