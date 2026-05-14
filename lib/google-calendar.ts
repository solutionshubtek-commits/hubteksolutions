// lib/google-calendar.ts
// Integração Google Calendar via Service Account (por tenant)

export interface GoogleCalendarConfig {
  client_email: string
  private_key: string
  calendar_id: string
}

export interface CalendarSlot {
  start: string  // ISO
  end: string    // ISO
}

export interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  description?: string
  attendees?: string[]
}

// ─── JWT / Auth ───────────────────────────────────────────────────────────────

async function getAccessToken(config: GoogleCalendarConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: config.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const headerB64 = encode(header)
  const payloadB64 = encode(payload)
  const signingInput = `${headerB64}.${payloadB64}`

  // Importa chave privada PEM
  const pemKey = config.private_key.replace(/\\n/g, '\n')
  const pemBody = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const encoder = new TextEncoder()
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  )

  const signatureB64 = btoa(Array.from(new Uint8Array(signatureBuffer)).map(b => String.fromCharCode(b)).join(''))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signingInput}.${signatureB64}`

  // Troca JWT por access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Google Auth falhou: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calendarBaseUrl(calendarId: string) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
}

function toISO(dateStr: string, timeStr: string, tzOffset = '-03:00') {
  return `${dateStr}T${timeStr}:00${tzOffset}`
}

function parseDateFromText(text: string): string {
  // Aceita "amanhã", "hoje", "dd/mm", "dd/mm/yyyy"
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000) // UTC-3
  if (/amanhã|amanha/i.test(text)) {
    now.setUTCDate(now.getUTCDate() + 1)
  } else if (/hoje/i.test(text)) {
    // já é hoje
  } else {
    const match = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/)
    if (match) {
      const day = parseInt(match[1])
      const month = parseInt(match[2]) - 1
      const year = match[3] ? parseInt(match[3]) : now.getUTCFullYear()
      now.setUTCFullYear(year, month, day)
    }
  }
  return now.toISOString().split('T')[0]
}

// ─── API pública ──────────────────────────────────────────────────────────────

/** Lista eventos de um dia específico */
export async function listEventsByDay(
  config: GoogleCalendarConfig,
  dateStr: string // YYYY-MM-DD
): Promise<CalendarEvent[]> {
  const token = await getAccessToken(config)
  const timeMin = `${dateStr}T00:00:00-03:00`
  const timeMax = `${dateStr}T23:59:59-03:00`

  const url = `${calendarBaseUrl(config.calendar_id)}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()

  return (data.items ?? []).map((e: Record<string, unknown>) => {
    const start = e.start as Record<string, string>
    const end = e.end as Record<string, string>
    return {
      id: e.id as string,
      summary: (e.summary as string) ?? 'Sem título',
      start: start.dateTime ?? start.date ?? '',
      end: end.dateTime ?? end.date ?? '',
      description: e.description as string | undefined,
    }
  })
}

/** Lista horários livres num dia (slots de duração em minutos dentro do horário de funcionamento) */
export async function listAvailableSlots(
  config: GoogleCalendarConfig,
  dateStr: string,
  horarioInicio: string, // "08:00"
  horarioFim: string,    // "18:00"
  duracaoMinutos = 60
): Promise<CalendarSlot[]> {
  const eventos = await listEventsByDay(config, dateStr)

  const [hI, mI] = horarioInicio.split(':').map(Number)
  const [hF, mF] = horarioFim.split(':').map(Number)
  const inicioMinutos = hI * 60 + mI
  const fimMinutos = hF * 60 + mF

  // Converte eventos para intervalos ocupados em minutos
  const ocupados = eventos.map(e => {
    const start = new Date(e.start)
    const end = new Date(e.end)
    const startMin = (start.getUTCHours() - 3 + 24) % 24 * 60 + start.getUTCMinutes()
    const endMin = (end.getUTCHours() - 3 + 24) % 24 * 60 + end.getUTCMinutes()
    return { start: startMin, end: endMin }
  })

  const slots: CalendarSlot[] = []
  for (let min = inicioMinutos; min + duracaoMinutos <= fimMinutos; min += duracaoMinutos) {
    const slotEnd = min + duracaoMinutos
    const livre = !ocupados.some(o => o.start < slotEnd && o.end > min)
    if (livre) {
      const startH = String(Math.floor(min / 60)).padStart(2, '0')
      const startM = String(min % 60).padStart(2, '0')
      const endH = String(Math.floor(slotEnd / 60)).padStart(2, '0')
      const endM = String(slotEnd % 60).padStart(2, '0')
      slots.push({
        start: toISO(dateStr, `${startH}:${startM}`),
        end: toISO(dateStr, `${endH}:${endM}`),
      })
    }
  }

  return slots
}

/** Cria um evento */
export async function createEvent(
  config: GoogleCalendarConfig,
  params: {
    summary: string
    start: string  // ISO
    end: string    // ISO
    description?: string
    attendeeEmail?: string
  }
): Promise<CalendarEvent> {
  const token = await getAccessToken(config)
  const body: Record<string, unknown> = {
    summary: params.summary,
    start: { dateTime: params.start, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: params.end, timeZone: 'America/Sao_Paulo' },
    description: params.description ?? '',
  }
  if (params.attendeeEmail) {
    body.attendees = [{ email: params.attendeeEmail }]
  }

  const res = await fetch(calendarBaseUrl(config.calendar_id), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.id) throw new Error(`Erro ao criar evento: ${JSON.stringify(data)}`)

  const start = data.start as Record<string, string>
  const end = data.end as Record<string, string>
  return {
    id: data.id,
    summary: data.summary,
    start: start.dateTime ?? start.date,
    end: end.dateTime ?? end.date,
  }
}

/** Reagenda um evento existente */
export async function rescheduleEvent(
  config: GoogleCalendarConfig,
  eventId: string,
  newStart: string,
  newEnd: string
): Promise<CalendarEvent> {
  const token = await getAccessToken(config)
  const res = await fetch(`${calendarBaseUrl(config.calendar_id)}/${eventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: { dateTime: newStart, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: newEnd, timeZone: 'America/Sao_Paulo' },
    }),
  })
  const data = await res.json()
  const start = data.start as Record<string, string>
  const end = data.end as Record<string, string>
  return {
    id: data.id,
    summary: data.summary,
    start: start.dateTime ?? start.date,
    end: end.dateTime ?? end.date,
  }
}

/** Cancela/deleta um evento */
export async function deleteEvent(
  config: GoogleCalendarConfig,
  eventId: string
): Promise<void> {
  const token = await getAccessToken(config)
  await fetch(`${calendarBaseUrl(config.calendar_id)}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** Busca evento pelo nome do cliente (para reagendar/cancelar) */
export async function findEventByName(
  config: GoogleCalendarConfig,
  nomeCliente: string,
  daysAhead = 30
): Promise<CalendarEvent | null> {
  const token = await getAccessToken(config)
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
  const timeMin = now.toISOString()
  const timeMax = future.toISOString()

  const url = `${calendarBaseUrl(config.calendar_id)}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&q=${encodeURIComponent(nomeCliente)}&singleEvents=true&orderBy=startTime`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()

  if (!data.items || data.items.length === 0) return null
  const e = data.items[0]
  const start = e.start as Record<string, string>
  const end = e.end as Record<string, string>
  return {
    id: e.id,
    summary: e.summary,
    start: start.dateTime ?? start.date,
    end: end.dateTime ?? end.date,
    description: e.description,
  }
}

export { parseDateFromText }
