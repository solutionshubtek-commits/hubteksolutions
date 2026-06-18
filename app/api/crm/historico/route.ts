import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/crm/historico?telefone=XXX&excluir_id=YYY
// Retorna leads encerrados anteriores do mesmo telefone (histórico CRM do cliente)

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(req.url)
    const telefone   = searchParams.get('telefone')
    const excluirId  = searchParams.get('excluir_id')

    if (!telefone) return NextResponse.json({ error: 'telefone obrigatório' }, { status: 400 })

    let query = supabase
      .from('crm_leads')
      .select(`
        id, conversation_id, etapa, funil_tipo, resumo, criado_em, atualizado_em,
        conversations(status)
      `)
      .eq('contato_telefone', telefone)
      .order('criado_em', { ascending: false })
      .limit(10)

    if (excluirId) query = query.neq('id', excluirId)

    const { data, error } = await query

    if (error) {
      console.error('[api/crm/historico] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filtra apenas leads de conversas encerradas
    const historico = (data ?? [])
      .filter((l: Record<string, unknown>) => {
        const conv = l.conversations as { status?: string } | null
        const status = conv?.status ?? ''
        return status === 'encerrado' || status === 'encerrada'
      })
      .map((l: Record<string, unknown>) => ({
        id:             l.id,
        conversation_id:l.conversation_id,
        etapa:          l.etapa,
        funil_tipo:     l.funil_tipo,
        resumo:         l.resumo,
        criado_em:      l.criado_em,
        atualizado_em:  l.atualizado_em,
      }))

    return NextResponse.json({ historico })
  } catch (err) {
    console.error('[api/crm/historico] exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}