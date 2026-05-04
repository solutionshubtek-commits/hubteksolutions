import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface PauseRequestBody {
  conversationId?: string
  acao?: string
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

    const body = (await request.json()) as PauseRequestBody
    const { conversationId, acao } = body

    if (!conversationId || !acao || !['pausar', 'retomar'].includes(acao)) {
      return NextResponse.json(
        { error: 'Parâmetros inválidos. Informe conversationId e acao (pausar|retomar)' },
        { status: 400 }
      )
    }

    const { data: conversa } = await supabase
      .from('conversations')
      .select('id, tenant_id')
      .eq('id', conversationId)
      .single()

    if (!conversa) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    const semPermissao =
      usuarioLogado.role !== 'admin_hubtek' &&
      conversa.tenant_id !== usuarioLogado.tenant_id

    if (semPermissao) {
      return NextResponse.json({ error: 'Sem permissão para esta conversa' }, { status: 403 })
    }

    const atualizacao =
      acao === 'pausar'
        ? {
            agente_pausado: true,
            pausado_por: session.user.id,
            pausado_em: new Date().toISOString(),
          }
        : {
            agente_pausado: false,
            pausado_por: null,
            pausado_em: null,
          }

    const { data: atualizada, error } = await supabase
      .from('conversations')
      .update(atualizacao)
      .eq('id', conversationId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data: atualizada })
  } catch (error) {
    console.error('[POST /api/agent/pause]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
