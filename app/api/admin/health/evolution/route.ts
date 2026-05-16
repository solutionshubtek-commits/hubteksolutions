import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  // Verifica autenticação — apenas admin_hubtek
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userData?.role !== 'admin_hubtek') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  try {
    const res = await fetch(`${process.env.EVOLUTION_API_URL}/instance/fetchInstances`, {
      headers: { 'apikey': process.env.EVOLUTION_API_KEY! },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const instancias = Array.isArray(data) ? data.length : 0
    return NextResponse.json({ ok: true, instancias })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 })
  }
}