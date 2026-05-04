import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { processIncomingMessage } from '@/lib/ai/process-message'

interface ProcessRequestBody {
  tenantId?: string
  phone?: string
  mensagem?: string
  instanceName?: string
}

// Endpoint para acionar o agente manualmente (uso interno / testes)
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
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (usuarioLogado?.role !== 'admin_hubtek') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = (await request.json()) as ProcessRequestBody
    const { tenantId, phone, mensagem, instanceName } = body

    if (!tenantId || !phone || !mensagem) {
      return NextResponse.json(
        { error: 'tenantId, phone e mensagem são obrigatórios' },
        { status: 400 }
      )
    }

    const instance = instanceName ?? process.env.EVOLUTION_INSTANCE_NAME ?? 'hubtek'
    const fakeId = `manual-${Date.now()}`

    await processIncomingMessage({
      tenantId,
      instanceName: instance,
      phone,
      messageId: fakeId,
      messageKey: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: fakeId },
      messageType: 'conversation',
      conteudo: mensagem,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/agent/process]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
