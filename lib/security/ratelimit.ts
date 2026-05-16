import { Redis } from '@upstash/redis'

// ─── Cliente Redis (Edge-compatible) ─────────────────────────────────────────
// @upstash/redis usa HTTP/REST — funciona no Edge Runtime do Vercel (middleware)

let redis: Redis | null = null

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number // segundos
}

// ─── Core — sliding window via Redis INCR + EXPIRE ───────────────────────────

async function checkLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const client = getRedis()

  // Se Redis não disponível, falha aberta (permite a requisição)
  if (!client) {
    return { allowed: true, remaining: limit, resetIn: windowSeconds }
  }

  try {
    const redisKey = `rl:${key}`
    const current = await client.incr(redisKey)

    // Na primeira chamada define o TTL da janela
    if (current === 1) {
      await client.expire(redisKey, windowSeconds)
    }

    const ttl = await client.ttl(redisKey)
    const remaining = Math.max(0, limit - current)

    return {
      allowed: current <= limit,
      remaining,
      resetIn: ttl > 0 ? ttl : windowSeconds,
    }
  } catch {
    // Falha aberta — Redis indisponível não bloqueia o sistema
    return { allowed: true, remaining: limit, resetIn: windowSeconds }
  }
}

// ─── Limites por rota ─────────────────────────────────────────────────────────

/**
 * Webhook da Evolution — limite por IP
 * 120 requisições por minuto
 */
export async function rateLimitWebhook(ip: string): Promise<RateLimitResult> {
  return checkLimit(`webhook:${ip}`, 120, 60)
}

/**
 * Login — limite por IP
 * 10 tentativas por 15 minutos (anti brute-force)
 */
export async function rateLimitLogin(ip: string): Promise<RateLimitResult> {
  return checkLimit(`login:${ip}`, 10, 900)
}

/**
 * Envio de mensagem WhatsApp — limite por tenant
 * 60 mensagens por minuto por tenant
 */
export async function rateLimitEnvioMensagem(tenantId: string): Promise<RateLimitResult> {
  return checkLimit(`envio:${tenantId}`, 60, 60)
}

/**
 * Upload de knowledge base — limite por IP
 * 20 uploads por hora
 */
export async function rateLimitUpload(ip: string): Promise<RateLimitResult> {
  return checkLimit(`upload:${ip}`, 20, 3600)
}

/**
 * Convite de operadores — limite por IP
 * 10 convites por hora
 */
export async function rateLimitConviteOperador(ip: string): Promise<RateLimitResult> {
  return checkLimit(`convite:${ip}`, 10, 3600)
}

/**
 * Rotas de API gerais — limite por IP
 * 200 requisições por minuto
 */
export async function rateLimitGeral(ip: string): Promise<RateLimitResult> {
  return checkLimit(`geral:${ip}`, 200, 60)
}

// ─── Helper para resposta padronizada ────────────────────────────────────────

export function rateLimitResponse(result: RateLimitResult) {
  return new Response(
    JSON.stringify({ error: 'Muitas requisições. Tente novamente em breve.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': String(result.remaining),
        'Retry-After': String(result.resetIn),
      },
    }
  )
}