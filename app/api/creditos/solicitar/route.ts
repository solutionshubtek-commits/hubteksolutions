import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { exigirUsuarioComTenant } from '@/lib/auth/tenant'
import { CREDITO_EXTRA, PACOTES_CREDITO_MAP, valorCreditosPersonalizado } from '@/lib/planos'

/** Teto do pedido personalizado. Acima disso é conversa comercial, não botão. */
const QUANTIDADE_MAXIMA = 1000

/** Pedidos pendentes simultâneos por cliente, para a fila do admin não virar spam. */
const MAX_PENDENTES = 5

/**
 * POST /api/creditos/solicitar
 *
 * O cliente pede um pacote fechado (`{ pacoteId: 'pacote_20' }`) ou uma
 * quantidade personalizada (`{ quantidade: 35 }`). Cria a solicitação como
 * `pendente` e avisa a Hubtek — NÃO gera crédito. O saldo só nasce quando o
 * pagamento é confirmado em /api/admin/creditos/aprovar.
 *
 * Operador não compra: quem contrata é o dono da conta.
 */
export async function POST(request: Request) {
  try {
    const guarda = await exigirUsuarioComTenant({
      papeis: ['admin_tenant', 'self_managed', 'admin_hubtek'],
    })
    if (guarda.erro) return guarda.erro

    const corpo = await request.json().catch(() => ({})) as {
      pacoteId?: string
      quantidade?: number
    }

    // O preço NUNCA vem do cliente — é derivado de lib/planos.ts. Aceitar um
    // valor do corpo deixaria comprar 100 créditos por R$ 1,00.
    let quantidade: number
    let valorTotal: number
    let tipo: 'pacote' | 'personalizado'

    if (corpo.pacoteId) {
      const pacote = PACOTES_CREDITO_MAP[corpo.pacoteId]
      if (!pacote) {
        return NextResponse.json({ error: 'Pacote inválido' }, { status: 400 })
      }
      quantidade = pacote.creditos
      valorTotal = pacote.valor
      tipo = 'pacote'
    } else if (typeof corpo.quantidade === 'number') {
      if (!CREDITO_EXTRA.permitePersonalizado) {
        return NextResponse.json({ error: 'Quantidade personalizada indisponível' }, { status: 400 })
      }
      // Number.isInteger recusa 2.5 e também NaN/Infinity, que passariam por
      // um `> 0` desatento e virariam quantidade inválida no banco.
      if (!Number.isInteger(corpo.quantidade) || corpo.quantidade <= 0) {
        return NextResponse.json({ error: 'Quantidade inválida' }, { status: 400 })
      }
      if (corpo.quantidade > QUANTIDADE_MAXIMA) {
        return NextResponse.json(
          { error: `Para mais de ${QUANTIDADE_MAXIMA} créditos, fale com o comercial` },
          { status: 400 }
        )
      }
      quantidade = corpo.quantidade
      valorTotal = valorCreditosPersonalizado(corpo.quantidade)
      tipo = 'personalizado'
    } else {
      return NextResponse.json({ error: 'Informe pacoteId ou quantidade' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { count: pendentes } = await supabase
      .from('credito_solicitacoes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', guarda.tenantId)
      .eq('status', 'pendente')

    if ((pendentes ?? 0) >= MAX_PENDENTES) {
      return NextResponse.json(
        { error: 'Você já tem pedidos aguardando confirmação. Fale com a Hubtek.' },
        { status: 409 }
      )
    }

    const { data: solicitacao, error } = await supabase
      .from('credito_solicitacoes')
      .insert({
        tenant_id: guarda.tenantId,
        quantidade,
        valor_total: valorTotal,
        tipo,
        solicitado_por: guarda.userId,
      })
      .select('id, quantidade, valor_total, tipo, status, solicitado_em')
      .single()

    if (error) {
      console.error('[creditos/solicitar] erro ao gravar:', error)
      return NextResponse.json({ error: 'Erro ao registrar solicitação' }, { status: 500 })
    }

    await notificarHubtek(supabase, guarda.tenantId, quantidade, valorTotal, tipo)

    return NextResponse.json({ solicitacao }, { status: 201 })
  } catch (err) {
    console.error('[creditos/solicitar] erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * Avisa os admins da Hubtek pelo sino da dashboard.
 *
 * Falha aqui não derruba a solicitação: o pedido já está gravado e aparece na
 * fila do admin de qualquer forma. Perder o aviso é bem menos grave do que
 * devolver erro a um cliente cujo pedido foi de fato registrado.
 */
async function notificarHubtek(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  quantidade: number,
  valorTotal: number,
  tipo: string
): Promise<void> {
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('nome')
      .eq('id', tenantId)
      .single()

    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin_hubtek')

    if (!admins?.length) return

    await supabase.from('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        tenant_id: tenantId,
        tipo: 'credito_solicitado',
        titulo: 'Novo pedido de créditos extras',
        mensagem:
          `${(tenant as { nome?: string } | null)?.nome ?? 'Cliente'} pediu ${quantidade} ` +
          `crédito(s) — R$ ${valorTotal.toFixed(2)}. Confirme o pagamento para liberar.`,
        metadata: { tenant_id: tenantId, quantidade, valor_total: valorTotal, tipo },
        lida: false,
      }))
    )
  } catch (err) {
    console.error('[creditos/solicitar] notificação falhou (pedido segue registrado):', err)
  }
}
