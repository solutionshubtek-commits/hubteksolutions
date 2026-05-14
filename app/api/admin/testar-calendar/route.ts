// app/api/admin/testar-calendar/route.ts
import { NextResponse } from 'next/server'
import { listEventsByDay } from '@/lib/google-calendar'

export async function POST(request: Request) {
  try {
    const { client_email, private_key, calendar_id } = await request.json()

    if (!client_email || !private_key || !calendar_id) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    // Testa listando eventos de hoje — se não der erro, as credenciais são válidas
    const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0]
    await listEventsByDay({ client_email, private_key, calendar_id }, hoje)

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[testar-calendar]', msg)
    return NextResponse.json(
      { error: msg.includes('Google Auth') ? 'Credenciais inválidas.' : 'Erro ao acessar o calendário.' },
      { status: 400 }
    )
  }
}
