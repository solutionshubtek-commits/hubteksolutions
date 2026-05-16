import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  rateLimitWebhook,
  rateLimitLogin,
  rateLimitEnvioMensagem,
  rateLimitUpload,
  rateLimitConviteOperador,
  rateLimitGeral,
  rateLimitResponse,
} from '@/lib/security/ratelimit'

// ─── Helper: IP real do cliente ───────────────────────────────────────────────

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  )
}

// ─── Helper: tenant_id do token JWT (sem query ao banco) ──────────────────────
// O Supabase inclui `app_metadata` no JWT — não usamos aqui pois o tenant_id
// está em `public.users`. Para rotas que precisam de tenant_id no rate limit,
// extraímos do body somente quando necessário (veja abaixo).

// ─── Middleware principal ─────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = getClientIp(request)

  // ── 1. Rate limit nas rotas de API ─────────────────────────────────────────

  if (pathname.startsWith('/api/')) {

    // Webhook Evolution — limite por IP, mais generoso
    if (pathname === '/api/webhook/evolution') {
      const result = await rateLimitWebhook(ip)
      if (!result.allowed) return rateLimitResponse(result)
    }

    // Envio de mensagem / mídia — limite por tenant_id (vem no body)
    else if (
      pathname === '/api/whatsapp/enviar-mensagem' ||
      pathname === '/api/whatsapp/enviar-midia-url'
    ) {
      // Clona o request para ler o body sem consumir o original
      const cloned = request.clone()
      try {
        const body = await cloned.json()
        const tenantId = body?.tenant_id
        if (tenantId) {
          const result = await rateLimitEnvioMensagem(tenantId)
          if (!result.allowed) return rateLimitResponse(result)
        }
      } catch {
        // Body inválido — deixa passar (a rota tratará o erro)
      }
    }

    // Upload knowledge base — limite por tenant_id (vem no FormData)
    else if (pathname === '/api/knowledge-base/upload') {
      // FormData não é clonável de forma segura no Edge — usamos IP como fallback
      const result = await rateLimitUpload(ip)
      if (!result.allowed) return rateLimitResponse(result)
    }

    // Convite de operadores — limite por IP
    else if (pathname === '/api/operadores/convidar') {
      const result = await rateLimitConviteOperador(ip)
      if (!result.allowed) return rateLimitResponse(result)
    }

    // Todas as outras rotas de API — limite geral por IP
    else {
      const result = await rateLimitGeral(ip)
      if (!result.allowed) return rateLimitResponse(result)
    }

    // Rotas de API não precisam de verificação de sessão — retorna aqui
    return NextResponse.next()
  }

  // ── 2. Rate limit no login ──────────────────────────────────────────────────

  if (pathname.startsWith('/login')) {
    const result = await rateLimitLogin(ip)
    if (!result.allowed) return rateLimitResponse(result)
  }

  // ── 3. Autenticação e controle de acesso (lógica original preservada) ───────

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

  // Buscar role
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)'],
}