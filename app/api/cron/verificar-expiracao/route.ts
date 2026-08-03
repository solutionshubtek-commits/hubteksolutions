import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { estaExpirado, statusComercialDe } from '@/lib/ciclo-vida'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

const ADMIN_USER_ID = process.env.ADMIN_HUBTEK_USER_ID!

const emailBase = (titulo: string, mensagem: string, cta: string) => `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#f1f5f9;border-radius:12px;">
    <img src="https://app.hubteksolutions.tech/logo-horizontal.png" alt="Hubtek" style="height:36px;margin-bottom:24px;" />
    <h2 style="color:#f97316;margin:0 0 12px;">${titulo}</h2>
    <p style="color:#94a3b8;line-height:1.6;">${mensagem}</p>
    <a href="https://app.hubteksolutions.tech" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#10B981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
      ${cta}
    </a>
    <p style="margin-top:32px;color:#475569;font-size:12px;">Hubtek Solutions · hubteksolutions.tech</p>
  </div>
`

/**
 * EIXO 2 — aplica de fato o vencimento do plano.
 *
 * Até aqui este cron só avisava (D-7 e D-1) e não fazia nada no dia D: o plano
 * vencia, o banner do Header sumia (ele só cobre diff entre 0 e 7) e o agente
 * seguia atendendo normalmente, porque `isTenantAgentActive` nunca leu
 * `expira_em`. Na prática não existia expiração — existia aviso de expiração.
 *
 * A pausa é reversível e a renovação a desfaz (ver handleSalvarEdicao em
 * admin/clientes). Expirado NÃO é cancelado: `status_comercial` não é tocado
 * aqui, o cliente continua visível e o gestor continua com acesso.
 *
 * Idempotência: `expirado_em` funciona como marca de processamento. O update
 * carrega `.is('expirado_em', null)` para que duas execuções simultâneas não
 * gerem notificação duplicada.
 */
async function processarExpirados(hoje: Date): Promise<number> {
  const { data: candidatos } = await supabase
    .from('tenants')
    .select('id, nome, expira_em, status_comercial, agente_ativo, pausado_por_admin')
    .not('expira_em', 'is', null)
    .lt('expira_em', hoje.toISOString())
    .is('expirado_em', null)

  if (!candidatos || candidatos.length === 0) return 0

  let expirados = 0
  const agora = new Date().toISOString()

  for (const tenant of candidatos) {
    // Confere pela mesma conta que as telas usam — o filtro SQL acima é só o
    // recorte grosso, senão o cron marcaria como vencido quem os badges ainda
    // mostram com "0 dias".
    if (!estaExpirado(tenant.expira_em)) continue

    // Cancelado/arquivado já está fora da operação pelo Eixo 1. Marcar de novo
    // por expiração só poluiria o log e o sininho.
    if (statusComercialDe(tenant.status_comercial) !== 'ativo') continue

    // Se o agente JÁ estava desligado por outro motivo, não assumimos a autoria
    // da pausa — senão a renovação religaria por cima de uma decisão manual.
    const jaEstavaPausado = tenant.agente_ativo === false || tenant.pausado_por_admin === true

    const { data: atualizado } = await supabase
      .from('tenants')
      .update({
        expirado_em: agora,
        ...(jaEstavaPausado ? {} : {
          agente_ativo: false,
          pausado_por_admin: true,
          agente_pausado_em: agora,
          pausa_por_expiracao: true,
        }),
      })
      .eq('id', tenant.id)
      .is('expirado_em', null)
      .select('id')
      .maybeSingle()

    // Outra execução chegou primeiro — não notifica de novo.
    if (!atualizado) continue

    const titulo = 'Acesso expirado — atendimento pausado'
    const mensagem =
      'Seu plano venceu e o agente de atendimento foi pausado. ' +
      'Renove para retomar o atendimento automaticamente. Seus dados e ' +
      'conversas continuam preservados.'

    const { data: usuarios } = await supabase
      .from('users')
      .select('id, email')
      .eq('tenant_id', tenant.id)
      .eq('role', 'admin_tenant')

    for (const usuario of usuarios ?? []) {
      await supabase.from('notifications').insert({
        tenant_id: tenant.id,
        user_id: usuario.id,
        tipo: 'expiracao_vencida',
        titulo,
        mensagem,
      })

      await resend.emails.send({
        from: 'Hubtek Solutions <noreply@hubteksolutions.tech>',
        to: usuario.email,
        subject: titulo,
        html: emailBase(titulo, mensagem, 'Renovar acesso'),
      })
    }

    if (ADMIN_USER_ID) {
      await supabase.from('notifications').insert({
        tenant_id: tenant.id,
        user_id: ADMIN_USER_ID,
        tipo: 'expiracao_vencida',
        titulo: `Acesso expirado — ${tenant.nome}`,
        mensagem: `O plano de ${tenant.nome} venceu${jaEstavaPausado ? '' : ' e o agente foi pausado automaticamente'}.`,
      })
    }

    await supabase.from('admin_logs').insert({
      tenant_id: tenant.id,
      tenant_nome: tenant.nome,
      acao: 'expiracao_aplicada',
      de: 'operante',
      para: 'expirado',
      automatico: true,
      detalhes: {
        expira_em: tenant.expira_em,
        agente_pausado_agora: !jaEstavaPausado,
        ja_estava_pausado: jaEstavaPausado,
      },
    })

    expirados++
  }

  return expirados
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hoje = new Date()
  const em7dias = new Date(hoje)
  em7dias.setDate(hoje.getDate() + 7)
  const em1dia = new Date(hoje)
  em1dia.setDate(hoje.getDate() + 1)

  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  // Aplica os vencimentos ANTES do bloco de avisos. Precisa vir aqui e não no
  // fim porque o fluxo de avisos abaixo tem retorno antecipado quando não há
  // ninguém vencendo em 7/1 dias — e os vencidos não podem depender disso.
  const expirados = await processarExpirados(hoje)

  // Busca tenants que vencem em 7 dias ou 1 dia
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, nome, expira_em')
    .or(
      `expira_em.gte.${formatDate(em7dias)}T00:00:00Z,expira_em.lte.${formatDate(em7dias)}T23:59:59Z,` +
      `expira_em.gte.${formatDate(em1dia)}T00:00:00Z,expira_em.lte.${formatDate(em1dia)}T23:59:59Z`
    )

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ ok: true, processados: 0, expirados })
  }

  let processados = 0

  for (const tenant of tenants) {
    const expira = new Date(tenant.expira_em)
    const diffDias = Math.round((expira.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDias !== 7 && diffDias !== 1) continue

    const tipo = diffDias === 7 ? 'expiracao_7dias' : 'expiracao_1dia'
    const titulo = diffDias === 7
      ? 'Acesso expira em 7 dias'
      : '⚠️ Acesso expira amanhã'
    const mensagem = diffDias === 7
      ? `Seu acesso à Hubtek Solutions expira em 7 dias (${expira.toLocaleDateString('pt-BR')}). Renove para não perder o serviço.`
      : `Seu acesso expira amanhã (${expira.toLocaleDateString('pt-BR')}). Renove agora para evitar interrupção.`

    // Evita duplicata — verifica se já foi criada hoje
    const { data: jaExiste } = await supabase
      .from('notifications')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('tipo', tipo)
      .gte('criado_em', formatDate(hoje) + 'T00:00:00Z')
      .maybeSingle()

    if (jaExiste) continue

    // Busca usuário admin_tenant do tenant
    const { data: usuarios } = await supabase
      .from('users')
      .select('id, email')
      .eq('tenant_id', tenant.id)
      .eq('role', 'admin_tenant')

    // Cria notificação para cada usuário do tenant
    if (usuarios && usuarios.length > 0) {
      for (const usuario of usuarios) {
        await supabase.from('notifications').insert({
          tenant_id: tenant.id,
          user_id: usuario.id,
          tipo,
          titulo,
          mensagem,
        })

        // Email para o cliente
        await resend.emails.send({
          from: 'Hubtek Solutions <noreply@hubteksolutions.tech>',
          to: usuario.email,
          subject: titulo,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#f1f5f9;border-radius:12px;">
              <img src="https://app.hubteksolutions.tech/logo-horizontal.png" alt="Hubtek" style="height:36px;margin-bottom:24px;" />
              <h2 style="color:#f97316;margin:0 0 12px;">${titulo}</h2>
              <p style="color:#94a3b8;line-height:1.6;">${mensagem}</p>
              <a href="https://app.hubteksolutions.tech" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#10B981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
                Acessar Dashboard
              </a>
              <p style="margin-top:32px;color:#475569;font-size:12px;">Hubtek Solutions · hubteksolutions.tech</p>
            </div>
          `,
        })
      }
    }

    // Notificação para o admin_hubtek (sininho)
    if (ADMIN_USER_ID) {
      const { data: adminJaExiste } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', ADMIN_USER_ID)
        .eq('tipo', tipo)
        .eq('tenant_id', tenant.id)
        .gte('criado_em', formatDate(hoje) + 'T00:00:00Z')
        .maybeSingle()

      if (!adminJaExiste) {
        await supabase.from('notifications').insert({
          tenant_id: tenant.id,
          user_id: ADMIN_USER_ID,
          tipo,
          titulo: `${titulo} — ${tenant.nome}`,
          mensagem: `O cliente ${tenant.nome} tem acesso expirando em ${diffDias} dia(s) (${expira.toLocaleDateString('pt-BR')}).`,
        })
      }
    }

    processados++
  }

  return NextResponse.json({ ok: true, processados, expirados })
}
