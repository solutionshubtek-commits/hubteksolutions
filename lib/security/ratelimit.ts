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
 * 600 requisições por minuto
 *
 * O limite é por IP e a Evolution API roda em um único host: TODOS os tenants
 * somam no mesmo balde. Com 120/min o teto era de ~40-60 conversas simultâneas
 * (2-3 mensagens/min cada) — mais restritivo que a cota da OpenAI depois do
 * upgrade para o tier 2 (450k TPM, ~56 mensagens/min no gpt-4o).
 *
 * Estourar aqui é pior que estourar na OpenAI: a Evolution não reenvia webhook
 * recusado, então o 429 faz a mensagem do cliente ser PERDIDA em silêncio — sem
 * erro na dashboard e sem resposta do agente. Não existe failover para isso,
 * diferente do 429 da OpenAI (ver o comentário do cliente em lib/ai/openai.ts).
 *
 * 600 deixa a proteção anti-abuso de pé com folga sobre a capacidade real de
 * processamento: acima de ~56 mensagens/min o gargalo volta a ser a cota da
 * OpenAI, que degrada de forma controlada.
 */
export async function rateLimitWebhook(ip: string): Promise<RateLimitResult> {
  return checkLimit(`webhook:${ip}`, 600, 60)
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