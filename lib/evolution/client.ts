import type { EvolutionMessageKey } from './webhook'

const BASE_URL = process.env.EVOLUTION_API_URL!
const API_KEY = process.env.EVOLUTION_API_KEY!

async function evolutionRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Evolution API ${response.status} em ${path}: ${text}`)
  }

  return response.json() as Promise<T>
}

export async function sendTextMessage(
  instanceName: string,
  phone: string,
  text: string
): Promise<void> {
  await evolutionRequest('POST', `/message/sendText/${instanceName}`, {
    number: phone,
    text,
  })
}

export async function getConnectionStatus(
  instanceName: string
): Promise<{ instance: { state: string } }> {
  return evolutionRequest('GET', `/instance/connectionState/${instanceName}`)
}

export async function downloadMediaAsBase64(
  instanceName: string,
  messageKey: EvolutionMessageKey
): Promise<{ base64: string; mimetype: string }> {
  return evolutionRequest('POST', `/chat/getBase64FromMediaMessage/${instanceName}`, {
    message: { key: messageKey },
  })
}
