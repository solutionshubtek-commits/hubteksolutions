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
  let duplicadasEvitadas = 0

  // AJUSTE (feedback Gabriel 15/07): trava de segurança em memória.
  // Se a tabela `appointments` tiver registros duplicados do mesmo compromisso
  // (mesmo tenant + telefone + horário), garante que apenas UM lembrete seja
  // criado nesta rodada. A dedup por appointment_id abaixo não cobre esse caso,
  // porque cada duplicata tem um id diferente.
  const compromissosJaProcessados = new Set<string>()

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

    // AJUSTE: chave única do compromisso — tenant + telefone + horário exato.
    // Bloqueia duplicatas dentro desta mesma rodada do cron.
    const chaveCompromisso = `${appt.tenant_id}|${appt.contato_telefone}|${dataAgendamento.toISOString()}`
    if (compromissosJaProcessados.has(chaveCompromisso)) {
      duplicadasEvitadas++
      continue
    }

    // Verifica se já existe task para este agendamento
    const { data: existing } = await supabase
      .from('scheduled_tasks')
      .select('id')
      .eq('appointment_id', appt.id)
      .in('status', ['pendente', 'enviado'])
      .maybeSingle()

    if (existing) {
      compromissosJaProcessados.add(chaveCompromisso)
      continue // já tem task criada
    }

    // AJUSTE: trava de segurança no banco — verifica se já existe lembrete
    // pendente/enviado para o mesmo contato no mesmo horário, mesmo que
    // vinculado a outro appointment_id (caso de registros duplicados).
    const { data: lembreteMesmoHorario } = await supabase
      .from('scheduled_tasks')
      .select('id')
      .eq('tenant_id', appt.tenant_id)
      .eq('contato_telefone', appt.contato_telefone)
      .eq('tipo', 'lembrete_agendamento')
      .eq('agendado_para', disparoEm.toISOString())
      .in('status', ['pendente', 'enviado'])
      .maybeSingle()

    if (lembreteMesmoHorario) {
      compromissosJaProcessados.add(chaveCompromisso)
      duplicadasEvitadas++
      continue
    }

    // Formata data/hora em português para a mensagem
    // AJUSTE: timeZone estava ausente na data (só a hora tinha) — perto da
    // meia-noite o lembrete podia anunciar o dia errado.
    const dataFormatada = dataAgendamento.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      timeZone: 'America/Sao_Paulo',
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

    if (!insertErr) {
      criadas++
      compromissosJaProcessados.add(chaveCompromisso)
    } else {
      console.error('[cron:gerar-lembretes] Erro ao inserir task:', insertErr)
    }
  }

  if (duplicadasEvitadas > 0) {
    console.warn(`[cron:gerar-lembretes] ${duplicadasEvitadas} lembrete(s) duplicado(s) evitado(s) — verifique agendamentos duplicados na tabela`)
  }

  return NextResponse.json({ ok: true, criadas, duplicadasEvitadas })
}