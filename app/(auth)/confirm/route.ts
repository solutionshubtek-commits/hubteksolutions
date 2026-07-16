// app/auth/confirm/route.ts
// Valida o token do e-mail SEM expor o domínio do Supabase no link.
//
// POR QUE ESTA ROTA EXISTE:
// O link padrão do Supabase aponta para <projeto>.supabase.co/auth/v1/verify.
// Como o remetente é @hubteksolutions.tech, o Gmail vê remetente e link em
// domínios diferentes — sinal clássico de phishing — e marca a mensagem como
// perigosa, removendo os links.
// Usando {{ .TokenHash }} no template, o link sai como
// app.hubteksolutions.tech/auth/confirm?token_hash=... e quem valida o token
// somos nós, via verifyOtp. Remetente e link no mesmo domínio.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const TIPOS_VALIDOS: EmailOtpType[] = ['recovery', 'invite', 'signup', 'email_change', 'magiclink']

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  const tokenHash = searchParams.get('token_hash')
  const tipoRaw   = searchParams.get('type')
  const next      = searchParams.get('next') ?? '/nova-senha'

  // Base canônica — evita redirecionar para a URL interna do deploy da Vercel
  const base = process.env.NEXT_PUBLIC_APP_URL ?? origin

  if (!tokenHash || !tipoRaw) {
    return NextResponse.redirect(`${base}/login?erro=link_invalido`)
  }

  const tipo = tipoRaw as EmailOtpType
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.redirect(`${base}/login?erro=link_invalido`)
  }

  const supabase = createClient()
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })

  if (error) {
    console.error('[auth/confirm] verifyOtp falhou:', error.message)
    return NextResponse.redirect(`${base}/login?erro=link_expirado`)
  }

  // Só aceita destinos internos — bloqueia open redirect
  const destino = next.startsWith('/') ? next : '/nova-senha'
  return NextResponse.redirect(`${base}${destino}`)
}