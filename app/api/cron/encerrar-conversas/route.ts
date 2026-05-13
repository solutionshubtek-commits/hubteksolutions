import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const limite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Busca conversas ativas com última mensagem do cliente há mais de 24h
  const { data: conversas, error } = await supabase
    .from('conversations')
    .select('id, ultima_mensagem_em')
    .eq('status', 'ativa')
    .lt('ultima_mensagem_em', limite)

  if (error) {
    console.error('Erro ao buscar conversas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!conversas || conversas.length === 0) {
    return NextResponse.json({ encerradas: 0 })
  }

  const ids = conversas.map(c => c.id)

  const { error: updateError } = await supabase
    .from('conversations')
    .update({ status: 'encerrada' })
    .in('id', ids)

  if (updateError) {
    console.error('Erro ao encerrar conversas:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  console.log(`[cron] ${ids.length} conversa(s) encerrada(s) automaticamente`)
  return NextResponse.json({ encerradas: ids.length })
}
