// app/auth/callback/route.ts
// Troca o `code` do link de e-mail por uma sessão válida e redireciona.
// Sem esta rota o link de recuperação cai no middleware sem sessão e é
// jogado de volta para /login — que era o bug do "esqueci minha senha".

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  const code             = searchParams.get('code')
  const next             = searchParams.get('next') ?? '/nova-senha'
  const errorDescription = searchParams.get('error_description')

  // Base canônica — evita redirecionar para a URL interna do deploy da Vercel
  const base = process.env.NEXT_PUBLIC_APP_URL ?? origin

  // Link inválido/expirado já sinalizado pelo próprio Supabase
  if (errorDescription) {
    console.warn('[auth/callback] Erro vindo do Supabase:', errorDescription)
    return NextResponse.redirect(`${base}/login?erro=link_invalido`)
  }

  if (!code) {
    return NextResponse.redirect(`${base}/login?erro=link_invalido`)
  }

  const supabase = createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession falhou:', error.message)
    return NextResponse.redirect(`${base}/login?erro=link_expirado`)
  }

  // Só aceita destinos internos — bloqueia open redirect
  const destino = next.startsWith('/') ? next : '/nova-senha'
  return NextResponse.redirect(`${base}${destino}`)
}