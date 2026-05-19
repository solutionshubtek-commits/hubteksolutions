// app/api/cron/gerar-lembretes/route.ts
// Roda a cada 15 min — detecta agendamentos próximos e cria scheduled_tasks

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Busca todos os tenants ativos com seus agendamentos ainda não lembrados
  // Junta com tenants para pegar antecedencia_horas configurada
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      *,
      tenants!inner(
        id,
        lembrete_antecedencia_horas,
        agente_ativo,
        pausado_por_admin
      )
    `)
    .eq('lembrete_enviado', false)
    .in('status', ['pendente', 'confirmado'])
    .gt('data_hora', new Date().toISOString()) // apenas futuros

  if (error) {
    console.error('[cron:gerar-lembretes] Erro:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ ok: true, criadas: 0 })
  }

  let criadas = 0

  for (const appt of appointments) {
    const tenant = appt.tenants
    const antecedenciaHoras = tenant.lembrete_antecedencia_horas ?? 24

    // Calcula quando deve disparar o lembrete
    const dataAgendamento = new Date(appt.data_hora)
    const disparoEm = new Date(dataAgendamento.getTime() - antecedenciaHoras * 60 * 60 * 1000)

    // Só cria se o disparo for no futuro próximo (até 15 min no passado para cobrir falhas)
    const agora = new Date()
    const quinzeMinAtras = new Date(agora.getTime() - 15 * 60 * 1000)

    if (disparoEm < quinzeMinAtras) continue // janela de disparo passou

    // Verifica se já existe task para este agendamento
    const { data: existing } = await supabase
      .from('scheduled_tasks')
      .select('id')
      .eq('appointment_id', appt.id)
      .in('status', ['pendente', 'enviado'])
      .maybeSingle()

    if (existing) continue // já tem task criada

    // Formata data/hora em português para a mensagem
    const dataFormatada = dataAgendamento.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
    const horaFormatada = dataAgendamento.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })

    const mensagemTemplate = `Olá {{nome}}! 👋 Passando para lembrar do seu agendamento de {{servico}} marcado para {{data}} às {{hora}}. Tudo certo pra você? Confirma a presença? 😊`

    const variaveis = {
      nome: appt.contato_nome,
      servico: appt.servico || 'serviço',
      data: dataFormatada,
      hora: horaFormatada,
    }

    const { error: insertErr } = await supabase.from('scheduled_tasks').insert({
      tenant_id: appt.tenant_id,
      instance_name: appt.instance_name,
      contato_telefone: appt.contato_telefone,
      contato_nome: appt.contato_nome,
      tipo: 'lembrete_agendamento',
      mensagem_inicial: mensagemTemplate,
      variaveis,
      status: 'pendente',
      agendado_para: disparoEm.toISOString(),
      appointment_id: appt.id,
    })

    if (!insertErr) criadas++
    else console.error('[cron:gerar-lembretes] Erro ao inserir task:', insertErr)
  }

  return NextResponse.json({ ok: true, criadas })
}