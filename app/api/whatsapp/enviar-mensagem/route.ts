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

    // 1. Envia mensagem via Evolution API
    const evoRes = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({
        number: telefone,
        text: mensagem,
      }),
    })

    if (!evoRes.ok) {
      const err = await evoRes.text()
      console.error('Erro Evolution sendText:', err)
      return NextResponse.json({ error: 'Erro ao enviar mensagem' }, { status: 500 })
    }

    // 2. Salva no banco como origem 'operador'
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: msg, error: dbError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        tenant_id,
        origem: 'operador',
        tipo: 'texto',
        conteudo: mensagem,
      })
      .select('id, conversation_id, tenant_id, origem, tipo, conteudo, criado_em')
      .single()

    if (dbError) {
      console.error('Erro ao salvar mensagem:', dbError)
      return NextResponse.json({ error: 'Mensagem enviada mas erro ao salvar' }, { status: 500 })
    }

    // 3. Atualiza ultima_mensagem_em da conversa
    await supabase.from('conversations')
      .update({ ultima_mensagem_em: new Date().toISOString() })
      .eq('id', conversation_id)

    return NextResponse.json({ success: true, message: msg })
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
