// app/api/conta/presenca/route.ts
// Heartbeat e toggle de disponibilidade do operador.
//
// O usuário SEMPRE vem da sessão — nunca do body. Um operador não consegue
// alterar a presença de outro, mesmo forjando a requisição.
//
// POST sem body        → apenas heartbeat (ping de "estou online")
// POST { status: ... } → heartbeat + troca de status (disponivel / ausente)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STATUS_VALIDOS = ['disponivel', 'ausente'] as const
type StatusAtendimento = typeof STATUS_VALIDOS[number]

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Body é opcional — heartbeat puro vem sem corpo
    let statusNovo: StatusAtendimento | null = null
    try {
      const body = await req.json() as { status?: string }
      if (body?.status) {
        if (!STATUS_VALIDOS.includes(body.status as StatusAtendimento)) {
          return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
        }
        statusNovo = body.status as StatusAtendimento
      }
    } catch {
      // sem body — segue como heartbeat puro
    }

    const patch: Record<string, unknown> = {
      ultimo_heartbeat: new Date().toISOString(),
    }
    if (statusNovo) patch.status_atendimento = statusNovo

    const { data, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', user.id)
      .select('status_atendimento')
      .single()

    if (error) {
      console.error('[conta/presenca] update falhou:', error.message)
      return NextResponse.json({ error: 'Erro ao atualizar presença' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, status: data?.status_atendimento ?? null })
  } catch (err) {
    console.error('[conta/presenca]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}