// app/api/cron/sync-calendar/route.ts
// Roda a cada hora — sincroniza Google Calendar de cada tenant com a tabela appointments

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 120

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Busca todos os tenants com google_calendar_config preenchido
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, google_calendar_config, lembrete_antecedencia_horas')
    .not('google_calendar_config', 'is', null)

  if (error || !tenants?.length) {
    return NextResponse.json({ ok: true, sincronizados: 0 })
  }

  let sincronizados = 0
  let erros = 0

  for (const tenant of tenants) {
    try {
      const config = tenant.google_calendar_config as {
        access_token: string
        refresh_token: string
        calendar_id: string
        instance_name: string
      }

      if (!config?.refresh_token || !config?.calendar_id) continue

      // Autentica OAuth2 do Google com credenciais do tenant
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      )

      oauth2Client.setCredentials({
        access_token: config.access_token,
        refresh_token: config.refresh_token,
      })

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

      // Sincroniza eventos das próximas 7 dias
      const agora = new Date()
      const em7dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000)

      const { data: eventos } = await calendar.events.list({
        calendarId: config.calendar_id,
        timeMin: agora.toISOString(),
        timeMax: em7dias.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      })

      const items = eventos.items ?? []

      for (const evento of items) {
        if (!evento.id || !evento.start?.dateTime) continue

        // Extrai telefone do evento (campo description ou extendedProperties)
        const telefone = extrairTelefone(
          evento.description ?? '',
          evento.extendedProperties?.private ?? {}
        )
        if (!telefone) continue

        const contato_nome = evento.summary ?? 'Cliente'
        const servico = evento.description?.split('\n')[0] ?? evento.summary ?? 'Agendamento'
        const data_hora = new Date(evento.start.dateTime).toISOString()

        // Upsert no appointments pelo google_event_id
        await supabase.from('appointments').upsert(
          {
            tenant_id: tenant.id,
            instance_name: config.instance_name,
            contato_nome,
            contato_telefone: telefone,
            servico,
            data_hora,
            google_event_id: evento.id,
            status: mapearStatus(evento.status ?? ''),
          },
          { onConflict: 'google_event_id' }
        )
      }

      sincronizados++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron:sync-calendar] Erro tenant ${tenant.id}:`, msg)
      erros++
    }
  }

  return NextResponse.json({ ok: true, sincronizados, erros })
}

function extrairTelefone(
  description: string,
  extProps: Record<string, string>
): string | null {
  // Tenta em extendedProperties primeiro
  if (extProps?.telefone) return extProps.telefone
  if (extProps?.phone) return extProps.phone

  // Tenta regex no campo description
  const match = description.match(/(\+?55?\s?\(?[1-9]{2}\)?\s?9?\d{4}[-\s]?\d{4})/)
  if (match) return match[1].replace(/\D/g, '')

  return null
}

function mapearStatus(googleStatus: string): string {
  const mapa: Record<string, string> = {
    confirmed: 'confirmado',
    tentative: 'pendente',
    cancelled: 'cancelado',
  }
  return mapa[googleStatus] ?? 'pendente'
}