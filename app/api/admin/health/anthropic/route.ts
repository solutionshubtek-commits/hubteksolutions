import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userData?.role !== 'admin_hubtek') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  try {
    // Usa uma mensagem mínima real — consome ~10 tokens, custo < $0.0001
    // É o método mais confiável para verificar se a API está aceitando requisições
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ok' }],
      }),
      signal: AbortSignal.timeout(8000),
    })

    // 200 = ok, 529 = sobrecarga, qualquer outro 5xx = problema
    if (res.status === 529) {
      return NextResponse.json({ ok: false, error: 'API sobrecarregada (529)' }, { status: 503 })
    }
    if (!res.ok && res.status !== 400) {
      // 400 pode acontecer mas significa que a API recebeu a requisição — está no ar
      throw new Error(`HTTP ${res.status}`)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 })
  }
}