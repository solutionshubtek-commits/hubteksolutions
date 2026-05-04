import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/ai/embeddings'

interface SearchRequestBody {
  query?: string
  threshold?: number
  limit?: number
  tenantId?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createClient()

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: usuarioLogado } = await supabase
      .from('users')
      .select('role, tenant_id')
      .eq('id', session.user.id)
      .single()

    if (!usuarioLogado) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const body = (await request.json()) as SearchRequestBody
    const { query, threshold = 0.7, limit = 5, tenantId: tenantIdBody } = body

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ error: 'O campo query é obrigatório' }, { status: 400 })
    }

    // admin_hubtek pode buscar em qualquer tenant via tenantId no body
    const tenantId =
      usuarioLogado.role === 'admin_hubtek'
        ? (tenantIdBody ?? usuarioLogado.tenant_id)
        : usuarioLogado.tenant_id

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não definido para este usuário' }, { status: 400 })
    }

    const embedding = await generateEmbedding(query)

    const { data: docs, error } = await supabase.rpc('match_knowledge', {
      query_embedding: embedding,
      match_tenant_id: tenantId,
      match_threshold: threshold,
      match_count: limit,
    })

    if (error) throw error

    return NextResponse.json({ data: docs ?? [] })
  } catch (error) {
    console.error('[POST /api/knowledge/search]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
