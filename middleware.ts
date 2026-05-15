import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Rotas públicas
  if (pathname === '/trocar-senha') {
    return supabaseResponse
  }

  // Login — redireciona se já autenticado
  if (pathname.startsWith('/login')) {
    if (user) {
      return NextResponse.redirect(new URL('/visao-geral', request.url))
    }
    return supabaseResponse
  }

  // Sem sessão → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Buscar role uma vez para todas as verificações abaixo
  const { data: userData } = await supabase
    .from('users')
    .select('role, senha_provisoria')
    .eq('id', user.id)
    .single()

  const role = userData?.role ?? ''

  // Senha provisória → forçar troca
  if (userData?.senha_provisoria && pathname !== '/trocar-senha') {
    return NextResponse.redirect(new URL('/trocar-senha', request.url))
  }

  // Rotas /admin → exige admin_hubtek
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin_hubtek') {
      return NextResponse.redirect(new URL('/visao-geral', request.url))
    }
  }

  // Rotas bloqueadas para operador
  const ROTAS_BLOQUEADAS_OPERADOR = ['/configuracoes', '/renovar-plano']
  if (role === 'operador' && ROTAS_BLOQUEADAS_OPERADOR.some(r => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/visao-geral', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)'],
}
