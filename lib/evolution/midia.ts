import type { SupabaseClient } from '@supabase/supabase-js'
import { downloadMediaAsBase64 } from '@/lib/evolution/client'
import type { EvolutionMessageKey } from '@/lib/evolution/webhook'

/**
 * Download e armazenamento das mídias trocadas no WhatsApp.
 *
 * Guardar o arquivo é registro do atendimento — vale tanto para o que o cliente
 * manda quanto para o que o operador responde, e independe de o agente entrar
 * na conversa. Enquanto isso morava dentro do processamento da IA, toda mídia
 * de conversa assumida por humano virava um ícone sem player nem link.
 */

const BUCKET = 'mensagens-midia'

// Extensão por mimetype, com fallback por tipo. Serve só para nomear o arquivo;
// o mimetype real é o que vai no contentType.
const EXTENSOES: Array<[RegExp, string]> = [
  [/ogg/, 'ogg'], [/mpeg|mp3/, 'mp3'], [/mp4/, 'mp4'], [/webm/, 'webm'],
  [/png/, 'png'], [/webp/, 'webp'],    [/jpeg|jpg/, 'jpg'],
  [/pdf/, 'pdf'],
]

export function extensaoPara(mimetype: string, tipoDb: string): string {
  const achou = EXTENSOES.find(([re]) => re.test(mimetype))
  if (achou) return achou[1]
  return tipoDb === 'audio' ? 'ogg'
    : tipoDb === 'imagem' ? 'jpg'
    : tipoDb === 'video' ? 'mp4'
    : 'bin'
}

// Teto de segurança. O WhatsApp já limita o envio, mas um base64 grande dentro
// de uma function serverless custa memória e tempo — e isto roda no caminho da
// resposta ao cliente.
const MIDIA_MAX_BYTES = 20 * 1024 * 1024

export interface MidiaBaixada {
  base64: string
  mimetype: string
}

/** Baixa a mídia da Evolution. Devolve null se não vier nada utilizável. */
export async function baixarMidia(
  instanceName: string,
  messageKey: EvolutionMessageKey,
): Promise<MidiaBaixada | null> {
  try {
    const midia = await downloadMediaAsBase64(instanceName, messageKey)
    if (!midia?.base64) return null
    return { base64: midia.base64, mimetype: midia.mimetype ?? '' }
  } catch (err) {
    console.warn('[midia] download falhou:', err)
    return null
  }
}

/**
 * Sobe a mídia para o storage e devolve a URL pública.
 *
 * Retorna null em qualquer falha: perder o anexo é ruim, mas nunca pode
 * interromper o atendimento — a mensagem em si já está registrada.
 */
export async function guardarMidia(
  supabase: SupabaseClient,
  tenantId: string,
  tipoDb: string,
  midia: MidiaBaixada,
): Promise<string | null> {
  try {
    const buffer = Buffer.from(midia.base64, 'base64')
    if (buffer.byteLength > MIDIA_MAX_BYTES) {
      console.warn(`[midia] ${tipoDb} de ${buffer.byteLength}B excede o teto — não armazenada`)
      return null
    }

    const path = `${tenantId}/${Date.now()}_${tipoDb}.${extensaoPara(midia.mimetype, tipoDb)}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: midia.mimetype || undefined })

    if (error) {
      console.warn('[midia] upload falhou:', error.message)
      return null
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.warn('[midia] falha ao guardar:', err)
    return null
  }
}

/** Baixa e guarda em um passo. Devolve a URL e o base64, para quem precisar dos dois. */
export async function baixarEGuardarMidia(
  supabase: SupabaseClient,
  instanceName: string,
  messageKey: EvolutionMessageKey,
  tenantId: string,
  tipoDb: string,
): Promise<{ url: string | null; midia: MidiaBaixada | null }> {
  const midia = await baixarMidia(instanceName, messageKey)
  if (!midia) return { url: null, midia: null }
  const url = await guardarMidia(supabase, tenantId, tipoDb, midia)
  return { url, midia }
}

// Mapeia o messageType da Evolution para o `tipo` gravado em messages.
export const TIPO_POR_MESSAGE_TYPE: Record<string, string> = {
  audioMessage:    'audio',
  imageMessage:    'imagem',
  videoMessage:    'video',
  documentMessage: 'documento',
}
