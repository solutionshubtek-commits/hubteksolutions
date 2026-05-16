import { Redis } from 'ioredis'

// ─── Cliente Redis ────────────────────────────────────────────────────────────
// Reutiliza o Redis já rodando no VPS (mesmo usado pela Evolution API)
// REDIS_URL deve estar no formato: redis://:<password>@<host>:<port>
// Se não tiver senha: redis://<host>:<port>

let redis: Redis | null = null

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    })
    redis.on('error', () => {
      // Silencia erros de conexão — rate limit falha aberta (não bloqueia o sistema)
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

// ─── Core — sliding window simples via Redis ──────────────────────────────────
// Usa INCR + EXPIRE: rápido, atômico, sem dependência de biblioteca extra

async function checkLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const client = getRedis()

  // Se Redis não estiver disponível, falha aberta (permite a requisição)
  if (!client) {
    return { allowed: true, remaining: limit, resetIn: windowSeconds }
  }

  try {
    const redisKey = `rl:${key}`
    const current = await client.incr(redisKey)

    // Na primeira chamada, define o TTL da janela
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
    // Falha aberta — Redis indisponível não deve bloquear o sistema
    return { allowed: true, remaining: limit, resetIn: windowSeconds }
  }
}

// ─── Limites por rota ─────────────────────────────────────────────────────────

/**
 * Webhook da Evolution — limite por IP
 * 120 requisições por minuto (margem generosa para fluxo normal de mensagens)
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
 * Upload de knowledge base — limite por tenant
 * 20 uploads por hora por tenant
 */
export async function rateLimitUpload(tenantId: string): Promise<RateLimitResult> {
  return checkLimit(`upload:${tenantId}`, 20, 3600)
}

/**
 * Convite de operadores — limite por tenant
 * 10 convites por hora por tenant
 */
export async function rateLimitConviteOperador(tenantId: string): Promise<RateLimitResult> {
  return checkLimit(`convite:${tenantId}`, 10, 3600)
}

/**
 * Rotas de API gerais — limite por IP
 * 200 requisições por minuto (proteção contra scraping/DDoS leve)
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