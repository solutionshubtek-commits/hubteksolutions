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
const DEBOUNCE_WINDOW_MS = 5000 // 5 segundos de espera após última mensagem

function chaveDebounce(tenantId: string, phone: string): string {
  return `debounce:${tenantId}:${phone}`
}

function chaveLock(tenantId: string, phone: string): string {
  return `debounce_lock:${tenantId}:${phone}`
}

// ─── Acumula mensagem na fila ─────────────────────────────────────────────────

/**
 * Adiciona mensagem à fila do Redis e reinicia o timer de debounce.
 * Retorna o timestamp atual para rastrear quando foi a última mensagem.
 */
export async function acumularMensagem(
  tenantId: string,
  phone: string,
  mensagem: MensagemAcumulada
): Promise<number> {
  const client = getRedis()
  if (!client) return Date.now()

  const chave = chaveDebounce(tenantId, phone)

  try {
    // Busca fila atual
    const atual = await client.get<FilaMensagens>(chave)
    const fila: FilaMensagens = atual ?? { mensagens: [], processando: false }

    // Acumula a nova mensagem
    fila.mensagens.push(mensagem)
    fila.processando = false

    // Salva com TTL
    await client.set(chave, fila, { ex: DEBOUNCE_TTL })

    return mensagem.timestamp
  } catch (err) {
    console.error('[debounce] acumularMensagem falhou:', err)
    return Date.now()
  }
}

// ─── Aguarda janela de debounce ───────────────────────────────────────────────

/**
 * Aguarda DEBOUNCE_WINDOW_MS e verifica se chegou nova mensagem no intervalo.
 * Se chegou → descarta (outra instância vai processar).
 * Se não chegou → adquire lock e retorna as mensagens acumuladas.
 *
 * Retorna null se este worker não deve processar (outra instância ganhou o lock).
 */
export async function aguardarEObterMensagens(
  tenantId: string,
  phone: string,
  timestampAtual: number
): Promise<MensagemAcumulada[] | null> {
  // Aguarda a janela de debounce
  await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WINDOW_MS))

  const client = getRedis()
  if (!client) return null

  const chave = chaveDebounce(tenantId, phone)
  const chave_lock = chaveLock(tenantId, phone)

  try {
    // Lê o estado atual da fila
    const atual = await client.get<FilaMensagens>(chave)
    if (!atual || atual.mensagens.length === 0) return null

    // Verifica se chegou mensagem mais nova que a nossa
    const ultimaMensagem = atual.mensagens[atual.mensagens.length - 1]
    if (ultimaMensagem.timestamp > timestampAtual) {
      // Chegou mensagem mais nova — deixa ela processar
      return null
    }

    // Tenta adquirir lock exclusivo (NX = only set if not exists)
    const lockObtido = await client.set(chave_lock, '1', { ex: 10, nx: true })
    if (!lockObtido) {
      // Outro worker já está processando
      return null
    }

    // Marca como processando e remove da fila
    await client.del(chave)

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