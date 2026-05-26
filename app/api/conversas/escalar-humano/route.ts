import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { conversation_id, tenant_id, motivo } = await request.json()

    if (!conversation_id || !tenant_id) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. Pausa o agente e marca como aguardando humano
    const { error: convError } = await supabase
      .from('conversations')
      .update({
        agente_pausado: true,
        atendente_id: null,
        atendente_nome: null,
        pausado_em: new Date().toISOString(),
      })
      .eq('id', conversation_id)
      .eq('tenant_id', tenant_id)

    if (convError) {
      console.error('[escalar-humano] Erro ao atualizar conversa:', convError)
      return NextResponse.json({ error: 'Erro ao escalar' }, { status: 500 })
    }

    // 2. Busca nome do contato para a notificação
    const { data: conv } = await supabase
      .from('conversations')
      .select('contato_nome, contato_telefone')
      .eq('id', conversation_id)
      .single()

    const nomeContato = conv?.contato_nome || conv?.contato_telefone || 'Cliente'

    // 3. Busca todos os usuários do tenant que devem receber notificação
    //    (admin_hubtek, admin_tenant, self_managed, operador)
    const { data: usuarios } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('ativo', true)
      .in('role', ['admin_hubtek', 'admin_tenant', 'self_managed', 'operador'])

    if (!usuarios || usuarios.length === 0) {
      return NextResponse.json({ success: true })
    }

    // 4. Cria uma notificação para cada usuário do tenant
    const notificacoes = usuarios.map((u) => ({
      user_id: u.id,
      tenant_id,
      tipo: 'atendimento_humano',
      titulo: 'Cliente aguardando atendimento humano',
      mensagem: `${nomeContato} ${motivo === 'solicitacao' ? 'solicitou atendimento humano' : 'precisa de atendimento humano — o agente não conseguiu resolver'}.`,
      metadata: { conversation_id, contato_nome: nomeContato, motivo: motivo ?? 'nao_resolvido' },
      lida: false,
    }))

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notificacoes)

    if (notifError) {
      console.error('[escalar-humano] Erro ao criar notificações:', notifError)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[escalar-humano] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}