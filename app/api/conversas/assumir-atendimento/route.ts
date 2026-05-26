import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { conversation_id } = await request.json()

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id obrigatório' }, { status: 400 })
    }

    // Identifica o usuário logado
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Busca nome do operador
    const { data: userData } = await supabase
      .from('users')
      .select('nome, tenant_id')
      .eq('id', user.id)
      .single()

    if (!userData) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Atualiza conversa com quem está atendendo
    const { error } = await supabase
      .from('conversations')
      .update({
        atendente_id: user.id,
        atendente_nome: userData.nome ?? 'Operador',
      })
      .eq('id', conversation_id)
      .eq('tenant_id', userData.tenant_id)

    if (error) {
      console.error('[assumir-atendimento] Erro:', error)
      return NextResponse.json({ error: 'Erro ao assumir atendimento' }, { status: 500 })
    }

    // Marca notificações desta conversa como lidas para TODOS do tenant
    await supabase
      .from('notifications')
      .update({ lida: true })
      .eq('tenant_id', userData.tenant_id)
      .eq('tipo', 'atendimento_humano')
      .contains('metadata', { conversation_id })

    return NextResponse.json({
      success: true,
      atendente_id: user.id,
      atendente_nome: userData.nome,
    })
  } catch (err) {
    console.error('[assumir-atendimento] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}