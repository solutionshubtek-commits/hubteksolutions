import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resend } from '@/lib/resend/client'

const PLANOS: Record<string, { label: string; limite: number; valor: number }> = {
  essencial:  { label: 'Essencial',  limite: 50,   valor: 397  },
  acelerador: { label: 'Acelerador', limite: 100,  valor: 597  },
  dominancia: { label: 'Dominância', limite: 500,  valor: 997  },
  elite:      { label: 'Elite',      limite: 1000, valor: 1497 },
}

const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function fmtBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tenant_id, tenant_nome, email_destino, mes_ref, ciclos } = body

    if (!email_destino || !mes_ref) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Busca plano do tenant se for individual
    let planoLabel = ''
    let planoValor = 0
    if (tenant_id) {
      const { data: tData } = await supabase
        .from('tenants')
        .select('plano')
        .eq('id', tenant_id)
        .single()
      const plano = PLANOS[tData?.plano ?? 'essencial'] ?? PLANOS.essencial
      planoLabel = plano.label
      planoValor = plano.valor
    }

    // Monta HTML do email
    const [ano, mes] = mes_ref.split('-')
    const mesNome = `${MESES_FULL[parseInt(mes) - 1]} ${ano}`
    const isConsolidado = !tenant_id

    const linhasTabela = ciclos.map((c: {
      tenant_nome: string
      conversas: number
      tokens: number
      custo_brl: number
      valor_cobrado: number
    }) => `
      <tr style="border-bottom:1px solid #2a2a2a;">
        <td style="padding:10px 14px;color:#e5e7eb;">${c.tenant_nome}</td>
        <td style="padding:10px 14px;text-align:right;color:#818cf8;">${c.conversas}</td>
        <td style="padding:10px 14px;text-align:right;color:#6b7280;">${(c.tokens / 1000).toFixed(1)}k</td>
        <td style="padding:10px 14px;text-align:right;color:#10a37f;">${fmtBRL(c.custo_brl)}</td>
        <td style="padding:10px 14px;text-align:right;color:#10b981;font-weight:600;">${fmtBRL(c.valor_cobrado)}</td>
      </tr>
    `).join('')

    const totalConversas = ciclos.reduce((s: number, c: { conversas: number }) => s + c.conversas, 0)
    const totalCusto = ciclos.reduce((s: number, c: { custo_brl: number }) => s + c.custo_brl, 0)
    const totalCobrado = ciclos.reduce((s: number, c: { valor_cobrado: number }) => s + c.valor_cobrado, 0)
    const totalTokens = ciclos.reduce((s: number, c: { tokens: number }) => s + c.tokens, 0)

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="margin-bottom:32px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:20px;font-weight:800;color:#10b981;letter-spacing:-0.5px;">HUBTEK</span>
        <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">SOLUTIONS</span>
      </div>
      <p style="margin:0;font-size:13px;color:#6b7280;">Relatório de consumo — ${mesNome}</p>
    </div>

    <!-- Card principal -->
    <div style="background:#111111;border:1px solid #1f1f1f;border-radius:16px;padding:28px;margin-bottom:24px;">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#ffffff;">
        ${isConsolidado ? 'Relatório Consolidado' : `Relatório — ${tenant_nome}`}
      </h2>
      <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">${mesNome}${!isConsolidado && planoLabel ? ` · Plano ${planoLabel}` : ''}</p>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
        <div style="background:#0a0a0a;border:1px solid #1f1f1f;border-radius:10px;padding:16px;">
          <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Conversas</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#818cf8;">${totalConversas}</p>
        </div>
        <div style="background:#0a0a0a;border:1px solid #1f1f1f;border-radius:10px;padding:16px;">
          <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Tokens consumidos</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#8b5cf6;">${(totalTokens / 1000).toFixed(1)}k</p>
        </div>
        <div style="background:#0a0a0a;border:1px solid #1f1f1f;border-radius:10px;padding:16px;">
          <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Custo API</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#10a37f;">${fmtBRL(totalCusto)}</p>
        </div>
        <div style="background:#0a0a0a;border:1px solid #1f1f1f;border-radius:10px;padding:16px;">
          <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">${isConsolidado ? 'Total a cobrar' : 'Valor do plano'}</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#10b981;">${fmtBRL(isConsolidado ? totalCobrado : planoValor)}</p>
        </div>
      </div>

      ${isConsolidado ? `
      <!-- Tabela consolidada -->
      <div style="border-radius:10px;overflow:hidden;border:1px solid #1f1f1f;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#1a1a1a;">
              <th style="padding:10px 14px;text-align:left;color:#9ca3af;font-weight:500;">Cliente</th>
              <th style="padding:10px 14px;text-align:right;color:#9ca3af;font-weight:500;">Conversas</th>
              <th style="padding:10px 14px;text-align:right;color:#9ca3af;font-weight:500;">Tokens</th>
              <th style="padding:10px 14px;text-align:right;color:#9ca3af;font-weight:500;">Custo API</th>
              <th style="padding:10px 14px;text-align:right;color:#9ca3af;font-weight:500;">Cobrado</th>
            </tr>
          </thead>
          <tbody>${linhasTabela}</tbody>
          <tfoot>
            <tr style="background:#1a1a1a;border-top:2px solid #2a2a2a;">
              <td style="padding:10px 14px;font-weight:700;color:#ffffff;">Total</td>
              <td style="padding:10px 14px;text-align:right;font-weight:700;color:#818cf8;">${totalConversas}</td>
              <td style="padding:10px 14px;text-align:right;font-weight:600;color:#6b7280;">${(totalTokens / 1000).toFixed(1)}k</td>
              <td style="padding:10px 14px;text-align:right;font-weight:700;color:#10a37f;">${fmtBRL(totalCusto)}</td>
              <td style="padding:10px 14px;text-align:right;font-weight:700;color:#10b981;">${fmtBRL(totalCobrado)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ` : `
      <!-- Detalhe individual -->
      <div style="background:#0a0a0a;border:1px solid #1f1f1f;border-radius:10px;padding:16px;">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1f1f1f;">
          <span style="color:#9ca3af;font-size:13px;">Custo médio por conversa</span>
          <span style="color:#e5e7eb;font-weight:600;font-size:13px;">${totalConversas > 0 ? fmtBRL(totalCusto / totalConversas) : '—'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;">
          <span style="color:#9ca3af;font-size:13px;">Período de referência</span>
          <span style="color:#e5e7eb;font-weight:600;font-size:13px;">${mesNome}</span>
        </div>
      </div>
      `}
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:16px;border-top:1px solid #1f1f1f;">
      <p style="margin:0 0 4px;font-size:12px;color:#4b5563;">Este relatório foi gerado automaticamente pelo painel Hubtek Solutions.</p>
      <p style="margin:0;font-size:12px;color:#374151;">
        <a href="https://app.hubteksolutions.tech" style="color:#10b981;text-decoration:none;">app.hubteksolutions.tech</a>
      </p>
    </div>

  </div>
</body>
</html>`

    const assunto = isConsolidado
      ? `Relatório Consolidado — ${mesNome} · Hubtek Solutions`
      : `Relatório de Consumo — ${tenant_nome} · ${mesNome}`

    const { error } = await resend.emails.send({
      from: 'Hubtek Solutions <noreply@hubteksolutions.tech>',
      to: [email_destino],
      subject: assunto,
      html,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[enviar-relatorio]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
