export type EvolutionEventType =
  | 'messages.upsert'
  | 'messages.update'
  | 'connection.update'
  | 'qrcode.updated'

export type WhatsAppMessageType =
  | 'conversation'
  | 'extendedTextMessage'
  | 'audioMessage'
  | 'imageMessage'
  | 'videoMessage'
  | 'documentMessage'
  | 'stickerMessage'

export interface EvolutionMessageKey {
  remoteJid: string
  fromMe: boolean
  id: string
}

export interface EvolutionMessageUpsertData {
  key: EvolutionMessageKey
  message: {
    conversation?: string
    extendedTextMessage?: { text: string }
    audioMessage?: { mimetype: string; seconds?: number }
    imageMessage?: { mimetype: string; caption?: string }
    videoMessage?: { mimetype: string; caption?: string }
    documentMessage?: { mimetype: string; title?: string; fileName?: string }
  }
  messageType: WhatsAppMessageType
  messageTimestamp: number
  pushName?: string
}

export interface EvolutionConnectionUpdateData {
  instance: string
  state: 'open' | 'close' | 'connecting'
}

export interface EvolutionWebhookEvent {
  event: EvolutionEventType
  instance: string
  data: EvolutionMessageUpsertData | EvolutionConnectionUpdateData
  date_time?: string
  sender?: string
  server_url?: string
  apikey?: string
}

export function extractPhone(remoteJid: string): string {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '')
}

export function parseWebhookEvent(body: unknown): EvolutionWebhookEvent | null {
  if (!body || typeof body !== 'object') return null
  const evt = body as Record<string, unknown>
  if (!evt.event || !evt.instance || !evt.data) return null
  return evt as unknown as EvolutionWebhookEvent
}

export function isMessageUpsertData(data: unknown): data is EvolutionMessageUpsertData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'key' in data &&
    'message' in data &&
    'messageType' in data
  )
}

export function isConnectionUpdateData(data: unknown): data is EvolutionConnectionUpdateData {
  return typeof data === 'object' && data !== null && 'state' in data
}

export function extractTextContent(data: EvolutionMessageUpsertData): string | undefined {
  return data.message.conversation ?? data.message.extendedTextMessage?.text
}
