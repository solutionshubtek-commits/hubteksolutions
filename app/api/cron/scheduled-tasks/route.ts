// app/api/cron/scheduled-tasks/route.ts
// Executa a cada 1 minuto — dispara tarefas proativas pendentes

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()

  // Busca tasks pendentes com agendado_para <= agora
  const { data: tasks, error } = await supabase
    .from('scheduled_tasks')
    .select('*, tenants!inner(id, plano, agente_ativo, pausado_por_admin)')
    .eq('status', 'pendente')
    .lte('agendado_para', now)
    .limit(50)

  if (error) {
    console.error('[cron:scheduled-tasks] Erro ao buscar tasks:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ ok: true, processadas: 0 })
  }

  let enviadas = 0
  let falhas = 0

  for (const task of tasks) {
    try {
      const tenant = task.tenants

      // Verifica se agente está ativo
      if (!tenant.agente_ativo || tenant.pausado_por_admin) {
        await marcarFalhou(task.id, 'agente_inativo_ou_pausado')
        falhas++
        continue
      }

      // Verifica limite do plano
      const limitok = await verificarLimitePlano(task.tenant_id, tenant.plano)
      if (!limitok) {
        await marcarFalhou(task.id, 'limite_plano_atingido')
        falhas++
        continue
      }

      // Prepara mensagem com variáveis interpoladas
      const mensagem = interpolarMensagem(task.mensagem_inicial, task.variaveis || {})

      // Envia via Evolution API
      const numero = formatarNumero(task.contato_telefone)
      const envioResp = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${task.instance_name}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: numero,
            text: mensagem,
          }),
        }
      )

      if (!envioResp.ok) {
        const err = await envioResp.text()
        await marcarFalhou(task.id, `evolution_error: ${err.slice(0, 200)}`)
        falhas++
        continue
      }

      // Cria ou reabre conversa — sempre nova para contabilizar no plano
      const conversationId = await criarNovaConversa(task)

      // Marca task como enviada
      await supabase
        .from('scheduled_tasks')
        .update({
          status: 'enviado',
          enviado_em: new Date().toISOString(),
          conversation_id: conversationId,
        })
        .eq('id', task.id)

      // Se era lembrete de agendamento, marca lembrete_enviado
      if (task.appointment_id) {
        await supabase
          .from('appointments')
          .update({ lembrete_enviado: true })
          .eq('id', task.appointment_id)
      }

      enviadas++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron:scheduled-tasks] Erro na task ${task.id}:`, msg)
      await marcarFalhou(task.id, msg.slice(0, 300))
      falhas++
    }
  }

  return NextResponse.json({ ok: true, enviadas, falhas })
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

async function marcarFalhou(taskId: string, erro: string) {
  await supabase
    .from('scheduled_tasks')
    .update({ status: 'falhou', erro })
    .eq('id', taskId)
}

function interpolarMensagem(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function formatarNumero(telefone: string): string {
  // Remove tudo que não for dígito e garante código do país
  const digits = telefone.replace(/\D/g, '')
  if (digits.startsWith('55')) return `${digits}@s.whatsapp.net`
  return `55${digits}@s.whatsapp.net`
}

async function criarNovaConversa(task: {
  tenant_id: string
  instance_name: string
  contato_nome: string
  contato_telefone: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      tenant_id: task.tenant_id,
      instance_name: task.instance_name,
      contato_nome: task.contato_nome,
      contato_telefone: task.contato_telefone,
      status: 'aberta',
      agente_pausado: false,
      ultima_mensagem_em: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Falha ao criar conversa: ${error?.message}`)
  }
  return data.id
}

async function verificarLimitePlano(tenantId: string, plano: string): Promise<boolean> {
  // Importa limites do plano
  const LIMITES: Record<string, number> = {
    essencial: 50,
    acelerador: 100,
    dominancia: 500,
    elite: 1000,
  }

  const limite = LIMITES[plano] ?? 50

  // Conta conversas do mês atual
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('criado_em', inicioMes.toISOString())

  return (count ?? 0) < limite
}