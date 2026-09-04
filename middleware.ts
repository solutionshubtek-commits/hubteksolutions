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
import { motivoBloqueio, podeOperar } from '@/lib/ciclo-vida'

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

// ─── Rotas públicas (não exigem sessão) ───────────────────────────────────────
// AJUSTE (F7 — recuperação de senha): o prefixo /auth inteiro e /nova-senha
// precisam ser públicos. O link do e-mail chega SEM sessão estabelecida — as
// rotas /auth/confirm e /auth/callback são justamente quem validam o token e
// criam a sessão. Antes, o middleware interceptava e redirecionava para /login,
// e o usuário nunca conseguia trocar a senha.
const ROTAS_PUBLICAS = ['/trocar-senha', '/auth', '/nova-senha']

// Destino do operador cujo cliente está com o plano vencido (ou cancelado).
// Continua exigindo sessão — não é rota pública.
const ROTA_ACESSO_EXPIRADO = '/acesso-expirado'

// ─── Helper: cliente Supabase com propagação de cookies ───────────────────────
// Extraído porque agora existem DOIS pontos que precisam de sessão: o controle
// de acesso das páginas e o gate de escrita das rotas de API.

function criarSupabase(request: NextRequest) {
  let response = NextResponse.next({ request })

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
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  return { supabase, getResponse: () => response }
}

// ─── Gate de escrita: cliente vencido ou cancelado não movimenta nada ─────────
//
// O bloqueio precisa morar no BACKEND, não em botões desabilitados: a dashboard
// roda no browser e esconder o botão não impede a requisição. Até aqui nenhuma
// rota de API checava o ciclo de vida — o gestor de um cliente vencido seguia
// enviando mensagem no WhatsApp, movendo lead no CRM e criando agendamento
// normalmente. Só o agente automático parava.
//
// Fica no middleware, e não espalhado por ~30 rotas, porque é regra do produto
// inteiro: assim uma rota nova já nasce protegida.

const METODOS_DE_ESCRITA = ['POST', 'PUT', 'PATCH', 'DELETE']

// Escritas que continuam liberadas mesmo com o acesso bloqueado. O critério é
// estreito: só passa o que o usuário precisa para cuidar da PRÓPRIA CONTA —
// nada que mexa em operação, cliente final ou dado de negócio.
const ESCRITAS_SEMPRE_LIBERADAS = [
  '/api/conta',           // trocar a própria senha, presença
  '/api/notifications',   // marcar aviso como lido
  '/api/creditos/saldo',  // leitura exposta como POST
  '/api/admin',           // painel da Hubtek (também liberado por papel, abaixo)
  '/api/cron',            // execuções internas, autenticadas por CRON_SECRET
  '/api/webhook',         // Evolution
  '/api/agent/process-webhook',
  '/api/billing',
]

/**
 * Decide se uma escrita de API pode seguir. `bloqueio` preenchido = barrada.
 *
 * Quando libera, devolve a `resposta` que o middleware deve retornar: ler a
 * sessão pode ROTACIONAR o refresh token, e engolir esses cookies deslogaria o
 * usuário no meio do uso.
 *
 * Só age quando existe sessão de usuário com tenant. Chamadas internas (cron,
 * webhook, disparo do agente) não carregam cookie de sessão e seguem
 * autenticadas pelo segredo de cada rota — este gate não as toca.
 */
async function bloqueioDeEscrita(
  request: NextRequest,
  pathname: string
): Promise<{ bloqueio: NextResponse | null; resposta: NextResponse | null }> {
  const liberado = { bloqueio: null, resposta: null }

  if (!METODOS_DE_ESCRITA.includes(request.method)) return liberado
  if (ESCRITAS_SEMPRE_LIBERADAS.some(r => pathname === r || pathname.startsWith(r + '/'))) return liberado

  const { supabase, getResponse } = criarSupabase(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { bloqueio: null, resposta: getResponse() }

  const { data: userData } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()

  // A Hubtek precisa poder operar sobre cliente vencido — é justamente quem
  // renova, cancela e arquiva.
  if (!userData?.tenant_id || userData.role === 'admin_hubtek') return { bloqueio: null, resposta: getResponse() }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('expira_em, status_comercial')
    .eq('id', userData.tenant_id)
    .single()

  // Falha de leitura não bloqueia: derrubar a operação de todos os clientes por
  // causa de uma consulta instável seria pior do que o furo que isso abre.
  if (!tenant || podeOperar(tenant)) return { bloqueio: null, resposta: getResponse() }

  const motivo = motivoBloqueio(tenant)
  const bloqueio = NextResponse.json(
    {
      error: motivo === 'expirado'
        ? 'Sua assinatura está vencida. Renove o plano para voltar a usar a ferramenta.'
        : 'O acesso desta conta está suspenso. Fale com a Hubtek Solutions.',
      motivo,
      bloqueio: 'ciclo_de_vida',
    },
    { status: 403 }
  )

  return { bloqueio, resposta: null }
}

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
    else if (pathname === '/api/knowledge/upload') {
      // FormData não é clonável de forma segura no Edge — usamos IP como fallback
      const result = await rateLimitUpload(ip)
      if (!result.allowed) return rateLimitResponse(result)
    }

    // Convite de operadores — limite por IP
    else if (pathname === '/api/operadores/convidar') {
      const result = await rateLimitConviteOperador(ip)
      if (!result.allowed) return rateLimitResponse(result)
    }

    // AJUSTE: troca de senha própria — limite mais restrito por IP para
    // dificultar tentativa de descobrir a senha atual por força bruta.
    else if (pathname === '/api/conta/alterar-senha') {
      const result = await rateLimitLogin(ip)
      if (!result.allowed) return rateLimitResponse(result)
    }

    // Disparo interno do agente — SEM limite por IP.
    //
    // Esta rota não é chamada por clientes: quem chama é /api/webhook/evolution,
    // via fetch, e ela já exige o CRON_SECRET no header `x-internal-secret`. Um
    // limite por IP aqui não agrega segurança — todas as chamadas saem do mesmo
    // IP de egress da Vercel, então TODOS os tenants dividiam um único balde de
    // 200/min do rateLimitGeral.
    //
    // E estourar aqui é uma falha silenciosa: o disparo no webhook é
    // fire-and-forget com `.catch` que só loga, então um 429 fazia a mensagem
    // do cliente ser descartada sem resposta e sem registro na dashboard.
    // Também era incoerente com o teto de 600/min do próprio webhook — não faz
    // sentido aceitar a mensagem na porta e derrubá-la no corredor.
    else if (pathname === '/api/agent/process-webhook') {
      // Sem rate limit — protegida por segredo interno.
    }

    // Todas as outras rotas de API — limite geral por IP
    else {
      const result = await rateLimitGeral(ip)
      if (!result.allowed) return rateLimitResponse(result)
    }

    // Ciclo de vida: cliente vencido ou cancelado não escreve nada.
    const { bloqueio, resposta } = await bloqueioDeEscrita(request, pathname)
    if (bloqueio) return bloqueio

    // Leitura de API não exige verificação de sessão aqui — cada rota faz a sua.
    return resposta ?? NextResponse.next()
  }

  // ── 2. Rate limit no login ──────────────────────────────────────────────────

  if (pathname.startsWith('/login')) {
    const result = await rateLimitLogin(ip)
    if (!result.allowed) return rateLimitResponse(result)
  }

  // ── 3. Autenticação e controle de acesso (lógica original preservada) ───────

  const { supabase, getResponse } = criarSupabase(request)

  const { data: { user } } = await supabase.auth.getUser()

  // Rotas públicas — checadas ANTES de qualquer redirecionamento por sessão
  if (ROTAS_PUBLICAS.some(r => pathname === r || pathname.startsWith(r + '/'))) {
    return getResponse()
  }

  // Login — redireciona se já autenticado
  if (pathname.startsWith('/login')) {
    if (user) {
      return NextResponse.redirect(new URL('/visao-geral', request.url))
    }
    return getResponse()
  }

  // Sem sessão → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Buscar role
  const { data: userData } = await supabase
    .from('users')
    .select('role, senha_provisoria, tenant_id')
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

  // ── EIXO 2: acesso do operador quando o plano vence ────────────────────────
  //
  // Regra do ciclo de vida: plano vencido (ou cliente cancelado/arquivado) tira
  // o `operador` da operação, mas o gestor do cliente (`admin_tenant`) e o admin
  // master continuam entrando — são eles que renovam e fecham o ciclo. Antes
  // disso o middleware não lia estado nenhum do tenant: um operador de cliente
  // vencido há meses entrava e operava igual.
  //
  // A consulta ao tenant só acontece para `operador`, de propósito: é o único
  // papel afetado, e assim nenhum outro perfil paga a query extra por request
  // nem corre risco de ficar preso caso ela falhe.
  if (role === 'operador' && userData?.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('expira_em, status_comercial')
      .eq('id', userData.tenant_id)
      .single()

    const semAcesso = tenant ? !podeOperar(tenant) : false

    if (semAcesso && pathname !== ROTA_ACESSO_EXPIRADO) {
      return NextResponse.redirect(new URL(ROTA_ACESSO_EXPIRADO, request.url))
    }
    // Renovou no meio da sessão — devolve o operador à dashboard em vez de
    // deixá-lo olhando um aviso que não vale mais.
    if (!semAcesso && pathname === ROTA_ACESSO_EXPIRADO) {
      return NextResponse.redirect(new URL('/visao-geral', request.url))
    }
  } else if (pathname === ROTA_ACESSO_EXPIRADO) {
    // A tela é específica do operador bloqueado; ninguém mais tem o que fazer lá.
    return NextResponse.redirect(new URL('/visao-geral', request.url))
  }

  // Rotas bloqueadas para operador
  // Nota: /minha-conta NÃO entra aqui — todo usuário gerencia a própria conta.
  const ROTAS_BLOQUEADAS_OPERADOR = ['/configuracoes', '/renovar-plano']
  if (role === 'operador' && ROTAS_BLOQUEADAS_OPERADOR.some(r => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/visao-geral', request.url))
  }

  return getResponse()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)'],
}