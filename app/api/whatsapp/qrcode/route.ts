import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch(
      `${process.env.EVOLUTION_API_URL}/instance/connect/hubtek`,
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
