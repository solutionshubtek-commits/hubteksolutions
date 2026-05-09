import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

const ADMIN_USER_ID = process.env.ADMIN_HUBTEK_USER_ID!

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

  // Busca tenants que vencem em 7 dias ou 1 dia
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, nome, expira_em')
    .or(
      `expira_em.gte.${formatDate(em7dias)}T00:00:00Z,expira_em.lte.${formatDate(em7dias)}T23:59:59Z,` +
      `expira_em.gte.${formatDate(em1dia)}T00:00:00Z,expira_em.lte.${formatDate(em1dia)}T23:59:59Z`
    )

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ ok: true, processados: 0 })
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

  return NextResponse.json({ ok: true, processados })
}
