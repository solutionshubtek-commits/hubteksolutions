import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, tenant_id, acao, contato_nome, operador_nome } = await request.json()

    if (!conversation_id || !tenant_id || !acao) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
    }

    const authHeader = request.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let user_id: string | null = null
    let nomeFinal = operador_nome ?? 'Operador'

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user?.id) {
        user_id = user.id
        if (!operador_nome) {
          const { data: ud } = await supabase.from('users').select('nome').eq('id', user.id).single()
          nomeFinal = ud?.nome ?? 'Operador'
        }
      }
    }

    const acaoLabel = acao === 'pausou_ia'
      ? `${nomeFinal} pausou o agente na conversa com ${contato_nome ?? 'contato'}`
      : acao === 'retomou_ia'
      ? `${nomeFinal} retomou o agente na conversa com ${contato_nome ?? 'contato'}`
      : `${nomeFinal} realizou ação em conversa com ${contato_nome ?? 'contato'}`

    await supabase.from('conversation_logs').insert({
      tenant_id,
      conversation_id,
      user_id: user_id ?? undefined,
      acao,
      descricao: acaoLabel,
      contato_nome: contato_nome ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[registrar-log] Erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
