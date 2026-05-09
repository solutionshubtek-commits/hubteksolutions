import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const instanceName = searchParams.get('instance') || 'hubtek'

    const res = await fetch(
      `${process.env.EVOLUTION_API_URL}/instance/fetchInstances`,
      {
        headers: { apikey: process.env.EVOLUTION_API_KEY! },
        cache: 'no-store',
      }
    )
    const data = await res.json()
    const instancia = Array.isArray(data)
      ? data.find((i: { name: string }) => i.name === instanceName)
      : null

    return NextResponse.json({
      status: instancia?.connectionStatus || 'desconectado',
      numero: instancia?.ownerJid?.replace('@s.whatsapp.net', '') || '',
      nome: instancia?.profileName || '',
    })
  } catch {
    return NextResponse.json({ status: 'desconectado', numero: '', nome: '' })
  }
}
