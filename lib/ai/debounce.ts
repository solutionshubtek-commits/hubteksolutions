import { Redis } from '@upstash/redis'

// ─── Cliente Redis ─────────────────────────────────────────────────────────────

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

export interface MensagemAcumulada {
  conteudo: string
  tipo: string
  caption?: string
  messageId: string
  messageKey: Record<string, unknown>
  pushName?: string
  timestamp: number
}

export interface FilaMensagens {
  mensagens: MensagemAcumulada[]
  processando: boolean
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEBOUNCE_TTL = 30        // segundos — TTL da chave no Redis
const DEBOUNCE_WINDOW_MS = 10000 // 10 segundos de espera após última mensagem

function chaveDebounce(tenantId: string, phone: string): string {
  return `debounce:${tenantId}:${phone}`
}

function chaveLock(tenantId: string, phone: string): string {
  return `debounce_lock:${tenantId}:${phone}`
}

// ─── Acumula mensagem na fila ─────────────────────────────────────────────────

/**
 * Adiciona mensagem à fila do Redis.
 * Usa lock atômico separado para garantir que só UMA chamada dispare o process-webhook,
 * independente da latência do Redis ao ler a fila.
 */
export async function acumularMensagem(
  tenantId: string,
  phone: string,
  mensagem: MensagemAcumulada
): Promise<{ timestamp: number; isFirst: boolean }> {
  const client = getRedis()
  if (!client) return { timestamp: Date.now(), isFirst: true }

  const chave = chaveDebounce(tenantId, phone)
  const chaveDisparo = `debounce_dispatch:${tenantId}:${phone}`

  try {
    // Acumula a mensagem na fila — deduplica por messageId
    const atual = await client.get<FilaMensagens>(chave)
    const fila: FilaMensagens = atual ?? { mensagens: [], processando: false }

    const jaExiste = fila.mensagens.some(m => m.messageId === mensagem.messageId)
    if (jaExiste) {
      console.log(`[debounce] Mensagem duplicada ignorada: ${mensagem.messageId}`)
      return { timestamp: mensagem.timestamp, isFirst: false }
    }

    fila.mensagens.push(mensagem)
    await client.set(chave, fila, { ex: DEBOUNCE_TTL })

    // Tenta adquirir lock de disparo — só quem conseguir dispara o process-webhook
    // ex: 30s — tempo suficiente para o processamento completo
    const lockDisparo = await client.set(chaveDisparo, '1', { ex: 120, nx: true })
    const isFirst = !!lockDisparo

    return { timestamp: mensagem.timestamp, isFirst }
  } catch (err) {
    console.error('[debounce] acumularMensagem falhou:', err)
    return { timestamp: Date.now(), isFirst: true }
  }
}

// ─── Aguarda janela de debounce ───────────────────────────────────────────────

/**
 * Aguarda DEBOUNCE_WINDOW_MS e tenta adquirir lock exclusivo.
 * Durante a espera, novas mensagens continuam sendo acumuladas no Redis.
 * Retorna null se não conseguiu o lock (outro worker já está processando).
 */
export async function aguardarEObterMensagens(
  tenantId: string,
  phone: string
): Promise<MensagemAcumulada[] | null> {
  // Aguarda a janela de debounce — novas mensagens acumulam nesse tempo
  await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WINDOW_MS))

  const client = getRedis()
  if (!client) return null

  const chave = chaveDebounce(tenantId, phone)
  const chave_lock = chaveLock(tenantId, phone)

  try {
    // Tenta adquirir lock exclusivo
    const lockObtido = await client.set(chave_lock, '1', { ex: 120, nx: true })
    if (!lockObtido) return null

    // Lê e remove a fila
    const atual = await client.get<FilaMensagens>(chave)
    if (!atual || atual.mensagens.length === 0) return null

    await client.del(chave)

    console.log(`[debounce] Lock obtido para ${phone} — ${atual.mensagens.length} msg(s) acumuladas`)
    return atual.mensagens
  } catch (err) {
    console.error('[debounce] aguardarEObterMensagens falhou:', err)
    return null
  }
}

// ─── Libera lock após processamento ──────────────────────────────────────────

export async function liberarLock(tenantId: string, phone: string): Promise<void> {
  const client = getRedis()
  if (!client) return
  try {
    await client.del(chaveLock(tenantId, phone))
    await client.del(`debounce_dispatch:${tenantId}:${phone}`)
  } catch {
    // Silencioso
  }
}

// ─── Junta conteúdo das mensagens acumuladas ──────────────────────────────────

/**
 * Concatena o conteúdo de múltiplas mensagens em uma única string coerente.
 * Textos são unidos com espaço. A última mídia (se houver) é retornada separada.
 */
export function juntarMensagens(mensagens: MensagemAcumulada[]): {
  conteudo: string
  tipo: string
  caption?: string
  messageId: string
  messageKey: Record<string, unknown>
} {
  const textos: string[] = []
  let tipoFinal = 'conversation'
  let captionFinal: string | undefined
  let messageIdFinal = mensagens[0].messageId
  let messageKeyFinal = mensagens[0].messageKey

  for (const msg of mensagens) {
    // Prioriza mídia — se tiver áudio/imagem no lote, usa essa como base
    if (['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage'].includes(msg.tipo)) {
      tipoFinal = msg.tipo
      captionFinal = msg.caption
      messageIdFinal = msg.messageId
      messageKeyFinal = msg.messageKey
      if (msg.caption) textos.push(msg.caption)
    } else if (msg.conteudo?.trim()) {
      textos.push(msg.conteudo.trim())
    }
  }

  // Se não teve mídia, mantém tipo texto
  if (tipoFinal === 'conversation' && textos.length > 0) {
    tipoFinal = 'conversation'
  }

  return {
    conteudo: textos.join(' '),
    tipo: tipoFinal,
    caption: captionFinal,
    messageId: messageIdFinal,
    messageKey: messageKeyFinal,
  }
}