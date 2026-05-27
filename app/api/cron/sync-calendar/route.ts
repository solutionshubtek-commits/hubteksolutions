// app/api/cron/sync-calendar/route.ts
// Roda a cada hora — sincroniza Google Calendar → appointments (Service Account)

import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { listEventsByDay, type GoogleCalendarConfig } from '@/lib/google-calendar'

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 120

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Busca todos os tenants com google_calendar_config em agent_config
  const { data: configs, error } = await supabase
    .from('agent_config')
    .select('tenant_id, google_calendar_config')
    .not('google_calendar_config', 'is', null)

  if (error || !configs?.length) {
    return NextResponse.json({ ok: true, sincronizados: 0 })
  }

  // Busca instance_name padrão por tenant
  const { data: instances } = await supabase
    .from('tenant_instances')
    .select('tenant_id, instance_name')
    .eq('status', 'conectado')

  const instanceMap: Record<string, string> = {}
  for (const inst of instances ?? []) {
    if (!instanceMap[inst.tenant_id]) instanceMap[inst.tenant_id] = inst.instance_name
  }

  let sincronizados = 0
  let erros = 0

  for (const cfg of configs) {
    try {
      const calConfig = cfg.google_calendar_config as GoogleCalendarConfig
      if (!calConfig?.client_email || !calConfig?.private_key || !calConfig?.calendar_id) continue

      const instanceName = instanceMap[cfg.tenant_id]
      if (!instanceName) continue

      // Sincroniza próximos 7 dias
      for (let d = 0; d < 7; d++) {
        const data = new Date(Date.now() + d * 24 * 60 * 60 * 1000)
        const dateStr = new Date(data.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0]

        const eventos = await listEventsByDay(calConfig, dateStr)

        for (const evento of eventos) {
          if (!evento.id || !evento.start) continue

          // Só sincroniza eventos que NÃO foram criados pela dashboard
          // (os da dashboard já têm google_event_id no banco)
          const { data: existing } = await supabase
            .from('appointments')
            .select('id')
            .eq('google_event_id', evento.id)
            .maybeSingle()

          if (existing) continue // já existe, não duplica

          // Extrai telefone da descrição
          const telefone = extrairTelefone(evento.description ?? '')
          if (!telefone) continue

          // Mapeia status pelo título
          const isCancelado = evento.summary?.startsWith('[CANCELADO]')
          const isConfirmado = evento.summary?.startsWith('✓')
          const status = isCancelado ? 'cancelado' : isConfirmado ? 'confirmado' : 'pendente'

          // Insere apenas eventos externos (não criados pela dashboard)
          await supabase.from('appointments').insert({
            tenant_id: cfg.tenant_id,
            instance_name: instanceName,
            contato_nome: evento.summary?.replace(/^\[CANCELADO\]\s*|^✓\s*/, '') ?? 'Cliente',
            contato_telefone: telefone,
            servico: extrairServico(evento.description ?? ''),
            data_hora: evento.start,
            google_event_id: evento.id,
            status,
            lembrete_enviado: false,
            antecedencia_horas: 24,
          })
        }
      }

      sincronizados++
    } catch (err) {
      console.error(`[sync-calendar] Erro tenant ${cfg.tenant_id}:`, err)
      erros++
    }
  }

  return NextResponse.json({ ok: true, sincronizados, erros })
}

function extrairTelefone(description: string): string | null {
  const match = description.match(/Telefone:\s*(\+?[\d\s\-().]{10,15})/)
  if (match) return match[1].replace(/\D/g, '')
  // fallback — tenta qualquer número com DDD
  const fallback = description.match(/(\+?55?\s?\(?[1-9]{2}\)?\s?9?\d{4}[-\s]?\d{4})/)
  if (fallback) return fallback[1].replace(/\D/g, '')
  return null
}

function extrairServico(description: string): string | null {
  const match = description.match(/Serviço:\s*(.+)/)
  return match ? match[1].trim() : null
}