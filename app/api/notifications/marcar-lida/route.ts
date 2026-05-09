import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()

  if (id === 'all') {
    await supabase
      .from('notifications')
      .update({ lida: true })
      .eq('user_id', user.id)
  } else {
    await supabase
      .from('notifications')
      .update({ lida: true })
      .eq('id', id)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ ok: true })
}
