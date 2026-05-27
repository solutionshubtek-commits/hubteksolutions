// app/api/agendamentos/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createEvent,
  rescheduleEvent,
  deleteEvent,
  type GoogleCalendarConfig,
} from '@/lib/google-calendar'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCalendarConfig(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<GoogleCalendarConfig | null> {
  const { data } = await supabase
    .from('agent_config')
    .select('google_calendar_config')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const cfg = data?.google_calendar_config as GoogleCalendarConfig | null
  if (!cfg?.client_email || !cfg?.private_key || !cfg?.calendar_id) return null
  return cfg
}

function formatDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const offset = (page - 1) * limit

  let query = supabase
    .from('appointments')
    .select('*', { count: 'exact' })
    .eq('tenant_id', userData.tenant_id)
    .order('data_hora', { ascending: true })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, count })
}

// ─── POST — Criar agendamento + evento no Google Calendar ─────────────────────

export async function POST(request: Request) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await request.json()
  const { instance_name, contato_nome, contato_telefone, servico, data_hora, antecedencia_horas, profissional } = body

  if (!instance_name || !contato_nome || !contato_telefone || !data_hora) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const dataHoraComFuso = data_hora.includes('T') && !data_hora.includes('+') && !data_hora.includes('Z')
  ? `${data_hora}:00-03:00`
  : data_hora
if (new Date(dataHoraComFuso) <= new Date()) {
  return NextResponse.json({ error: 'Data do agendamento deve ser no futuro' }, { status: 400 })
}

  // 1. Salva no banco
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      tenant_id: userData.tenant_id,
      instance_name,
      contato_nome,
      contato_telefone,
      servico,
      data_hora,
      antecedencia_horas: antecedencia_horas ?? 24,
      criado_por: user.id,
      profissional: profissional ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. Cria evento no Google Calendar (se configurado)
  try {
    const calConfig = await getCalendarConfig(supabase, userData.tenant_id)
    if (calConfig) {
      // data_hora vem do datetime-local sem timezone — interpreta como Brasília (UTC-3)
      const dataHoraBrasilia = data_hora.includes('T') && !data_hora.includes('+') && !data_hora.includes('Z')
        ? `${data_hora}:00-03:00`
        : data_hora
      const inicio = new Date(dataHoraBrasilia)
      const fim = new Date(inicio.getTime() + 60 * 60 * 1000) // +1h padrão

      const evento = await createEvent(calConfig, {
        summary: `${contato_nome}${profissional ? ` — ${profissional}` : ''}`,
        start: dataHoraBrasilia,
        end: fim.toISOString(),
        description: [
          servico ? `Serviço: ${servico}` : '',
          `Telefone: ${contato_telefone}`,
          profissional ? `Profissional: ${profissional}` : '',
          `Agendado em: ${formatDataHora(new Date().toISOString())}`,
        ].filter(Boolean).join('\n'),
      })

      // Atualiza google_event_id no banco
      await supabase
        .from('appointments')
        .update({ google_event_id: evento.id })
        .eq('id', data.id)

      return NextResponse.json({ data: { ...data, google_event_id: evento.id } }, { status: 201 })
    }
  } catch (calErr) {
    console.error('[agendamentos:POST] Erro Google Calendar:', calErr)
    // Não falha o agendamento por causa do calendar
  }

  return NextResponse.json({ data }, { status: 201 })
}

// ─── PATCH — Atualizar agendamento + evento no Google Calendar ────────────────

export async function PATCH(request: Request) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
  delete updates.tenant_id

  // Busca agendamento atual para pegar google_event_id
  const { data: apptAtual } = await supabase
    .from('appointments')
    .select('google_event_id, data_hora, contato_nome, servico, contato_telefone, profissional')
    .eq('id', id)
    .eq('tenant_id', userData.tenant_id)
    .single()

  // 1. Atualiza no banco
  const { data, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', userData.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. Sincroniza com Google Calendar
  try {
    const calConfig = await getCalendarConfig(supabase, userData.tenant_id)
    if (calConfig && apptAtual?.google_event_id) {
      const novoStatus = updates.status
      const novaDataHora = updates.data_hora

      if (novoStatus === 'cancelado') {
        // Cancela evento no Google Calendar — atualiza título com [CANCELADO]
        const token = await getGoogleToken(calConfig)
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calConfig.calendar_id)}/events/${apptAtual.google_event_id}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              summary: `[CANCELADO] ${apptAtual.contato_nome}`,
              colorId: '11', // vermelho no Google Calendar
            }),
          }
        )
      } else if (novoStatus === 'confirmado') {
        // Confirma — atualiza título com ✓
        const token = await getGoogleToken(calConfig)
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calConfig.calendar_id)}/events/${apptAtual.google_event_id}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              summary: `✓ ${apptAtual.contato_nome}${apptAtual.profissional ? ` — ${apptAtual.profissional}` : ''}`,
              colorId: '2', // verde no Google Calendar
            }),
          }
        )
      } else if (novaDataHora) {
        // Reagenda — interpreta como Brasília (UTC-3)
        const novaDataHoraBrasilia = novaDataHora.includes('T') && !novaDataHora.includes('+') && !novaDataHora.includes('Z')
          ? `${novaDataHora}:00-03:00`
          : novaDataHora
        const inicio = new Date(novaDataHoraBrasilia)
        const fim = new Date(inicio.getTime() + 60 * 60 * 1000)
        await rescheduleEvent(calConfig, apptAtual.google_event_id, novaDataHoraBrasilia, fim.toISOString())
      }
    }
  } catch (calErr) {
    console.error('[agendamentos:PATCH] Erro Google Calendar:', calErr)
  }

  return NextResponse.json({ data })
}

// ─── DELETE — Cancela agendamento (mantém no calendar como cancelado) ─────────

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const forceDelete = searchParams.get('force') === 'true' // só para recontatos

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Busca google_event_id antes de deletar
  const { data: appt } = await supabase
    .from('appointments')
    .select('google_event_id, contato_nome, profissional')
    .eq('id', id)
    .eq('tenant_id', userData.tenant_id)
    .single()

  // Cancela tasks pendentes associadas
  await supabase
    .from('scheduled_tasks')
    .update({ status: 'cancelado' })
    .eq('appointment_id', id)
    .eq('status', 'pendente')

  if (forceDelete) {
    // Deleta do banco (recontatos)
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('tenant_id', userData.tenant_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Deleta do Google Calendar também
    try {
      const calConfig = await getCalendarConfig(supabase, userData.tenant_id)
      if (calConfig && appt?.google_event_id) {
        await deleteEvent(calConfig, appt.google_event_id)
      }
    } catch (calErr) {
      console.error('[agendamentos:DELETE] Erro Google Calendar:', calErr)
    }
  } else {
    // Cancela no banco (agendamentos)
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelado' })
      .eq('id', id)
      .eq('tenant_id', userData.tenant_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Marca como cancelado no Google Calendar
    try {
      const calConfig = await getCalendarConfig(supabase, userData.tenant_id)
      if (calConfig && appt?.google_event_id) {
        const token = await getGoogleToken(calConfig)
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calConfig.calendar_id)}/events/${appt.google_event_id}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              summary: `[CANCELADO] ${appt.contato_nome}${appt.profissional ? ` — ${appt.profissional}` : ''}`,
              colorId: '11',
            }),
          }
        )
      }
    } catch (calErr) {
      console.error('[agendamentos:DELETE] Erro Google Calendar:', calErr)
    }
  }

  return NextResponse.json({ ok: true })
}

// ─── Helper interno — pega token Google ───────────────────────────────────────

async function getGoogleToken(config: GoogleCalendarConfig): Promise<string> {
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

  const pemKey = config.private_key.replace(/\\n/g, '\n')
  const pemBody = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const encoder = new TextEncoder()
  const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signingInput))
  const signatureB64 = btoa(Array.from(new Uint8Array(signatureBuffer)).map(b => String.fromCharCode(b)).join(''))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signingInput}.${signatureB64}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error(`Google Auth falhou: ${JSON.stringify(data)}`)
  return data.access_token
}