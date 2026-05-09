import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const instanceName = searchParams.get('instance') || 'hubtek'

    const res = await fetch(
      `${process.env.EVOLUTION_API_URL}/instance/connect/${instanceName}`,
      {
        headers: { apikey: process.env.EVOLUTION_API_KEY! },
        cache: 'no-store',
      }
    )
    const data = await res.json()
    return NextResponse.json({ qrcode: data.base64 || null })
  } catch {
    return NextResponse.json({ qrcode: null })
  }
}
