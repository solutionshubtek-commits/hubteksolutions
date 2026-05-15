import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, tenant_id, instance_name, telefone, mensagem } = await request.json()

    if (!conversation_id || !tenant_id || !instance_name || !telefone || !mensagem) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
    }

    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
    }

    // Extrai user_id do JWT
    const authHeader = request.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let sent_by_user_id: string | null = null
    let operadorNome: string | null = null
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user?.id) {
        sent_by_user_id = user.id
        const { data: ud } = await supabase.from('users').select('nome').eq('id', user.id).single()
        operadorNome = ud?.nome ?? null
      }
    }

    // 1. Envia mensagem via Evolution API
    const evoRes = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number: telefone, text: mensagem }),
    })

    if (!evoRes.ok) {
      const err = await evoRes.text()
      console.error('Erro Evolution sendText:', err)
      return NextResponse.json({ error: 'Erro ao enviar mensagem' }, { status: 500 })
    }

    // 2. Salva no banco com sent_by_user_id
    const { data: msg, error: dbError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        tenant_id,
        origem: 'operador',
        tipo: 'texto',
        conteudo: mensagem,
        sent_by_user_id: sent_by_user_id ?? undefined,
      })
      .select('id, conversation_id, tenant_id, origem, tipo, conteudo, criado_em, sent_by_user_id')
      .single()

    if (dbError) {
      console.error('Erro ao salvar mensagem:', dbError)
      return NextResponse.json({ error: 'Mensagem enviada mas erro ao salvar' }, { status: 500 })
    }

    // 3. Atualiza ultima_mensagem_em
    await supabase.from('conversations')
      .update({ ultima_mensagem_em: new Date().toISOString() })
      .eq('id', conversation_id)

    // 4. Registra log de ação
    if (sent_by_user_id) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('contato_nome')
        .eq('id', conversation_id)
        .single()
      await supabase.from('conversation_logs').insert({
        tenant_id,
        conversation_id,
        user_id: sent_by_user_id,
        acao: 'enviou_mensagem',
        descricao: `${operadorNome ?? 'Operador'} enviou mensagem para ${conv?.contato_nome ?? telefone}`,
        contato_nome: conv?.contato_nome ?? telefone,
      })
    }

    return NextResponse.json({ success: true, message: msg })
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
