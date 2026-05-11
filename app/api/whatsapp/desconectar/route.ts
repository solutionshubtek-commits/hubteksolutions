import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { instance_name } = await request.json()

    if (!instance_name) {
      return NextResponse.json({ error: 'instance_name obrigatório' }, { status: 400 })
    }

    // 1. Desconecta na Evolution API
    const res = await fetch(
      `${process.env.EVOLUTION_API_URL}/instance/logout/${instance_name}`,
      {
        method: 'DELETE',
        headers: { apikey: process.env.EVOLUTION_API_KEY! },
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Erro Evolution logout:', err)
      return NextResponse.json({ error: 'Erro ao desconectar na Evolution API' }, { status: 500 })
    }

    // 2. Atualiza status no Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { error: dbError } = await supabase
      .from('tenant_instances')
      .update({ status: 'desconectado' })
      .eq('instance_name', instance_name)

    if (dbError) {
      console.error('Erro ao atualizar status no Supabase:', dbError)
      // Não retorna erro — a desconexão na Evolution já ocorreu
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Erro ao desconectar WhatsApp:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
