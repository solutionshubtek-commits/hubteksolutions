import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { instance_name } = await request.json()

    if (!instance_name) {
      return NextResponse.json({ error: 'instance_name obrigatório' }, { status: 400 })
    }

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

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Erro ao desconectar WhatsApp:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
