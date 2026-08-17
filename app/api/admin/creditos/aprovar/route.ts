import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { exigirAdminHubtek } from '@/lib/auth/admin'
import { CREDITO_EXTRA } from '@/lib/planos'
import { limparBloqueio } from '@/lib/creditos'

/**
 * POST /api/admin/creditos/aprovar
 *
 * Confirma o pagamento de uma solicitação e cria o lote de créditos, que passa
 * a valer na hora e expira em 90 dias. Também recusa, com
 * `{ solicitacaoId, acao: 'recusar' }`.
 *
 * Só admin_hubtek: é esta rota que transforma pedido em saldo, ou seja, em
 * dinheiro. Quando entrar Stripe, o gatilho vira o webhook de pagamento e o
 * corpo da lógica abaixo continua igual.
 */
export async function POST(request: Request) {
  try {
    const guarda = await exigirAdminHubtek()
    if (guarda.erro) return guarda.erro

    const { solicitacaoId, acao = 'aprovar' } = await request.json().catch(() => ({})) as {
      solicitacaoId?: string
      acao?: 'aprovar' | 'recusar'
    }

    if (!solicitacaoId) {
      return NextResponse.json({ error: 'solicitacaoId obrigatório' }, { status: 400 })
    }
    if (acao !== 'aprovar' && acao !== 'recusar') {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const agora = new Date()

    // A troca de status é a RESERVA da solicitação, e vem antes de criar o
    // lote: o filtro `status = 'pendente'` só casa uma vez, então um duplo
    // clique (ou dois admins ao mesmo tempo) não gera dois lotes de crédito
    // para o mesmo pagamento. Sem isso, o cliente ganharia saldo dobrado.
    const { data: reservada, error: erroReserva } = await supabase
      .from('credito_solicitacoes')
      .update({
        status: acao === 'aprovar' ? 'aprovada' : 'recusada',
        aprovado_por: guarda.userId,
        aprovado_em: agora.toISOString(),
      })
      .eq('id', solicitacaoId)
      .eq('status', 'pendente')
      .select('id, tenant_id, quantidade, valor_total, tipo')
      .maybeSingle()

    if (erroReserva) {
      console.error('[creditos/aprovar] erro ao reservar:', erroReserva)
      return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 })
    }

    if (!reservada) {
      return NextResponse.json(
        { error: 'Solicitação inexistente ou já processada' },
        { status: 409 }
      )
    }

    if (acao === 'recusar') {
      await notificarCliente(
        supabase, reservada.tenant_id,
        'Pedido de créditos recusado',
        `Seu pedido de ${reservada.quantidade} crédito(s) não foi aprovado. Fale com a Hubtek.`,
        { solicitacao_id: reservada.id }
      )
      return NextResponse.json({ solicitacao: reservada, status: 'recusada' })
    }

    const expiraEm = new Date(agora.getTime() + CREDITO_EXTRA.validadeDias * 864e5)

    const { data: pacote, error: erroPacote } = await supabase
      .from('credito_pacotes')
      .insert({
        tenant_id: reservada.tenant_id,
        origem: origemDoLote(reservada.tipo, reservada.quantidade),
        quantidade_total: reservada.quantidade,
        quantidade_restante: reservada.quantidade,
        valor_unitario: CREDITO_EXTRA.valorUnitario,
        valor_pago: reservada.valor_total,
        ativado_em: agora.toISOString(),
        expira_em: expiraEm.toISOString(),
      })
      .select('id, quantidade_total, quantidade_restante, ativado_em, expira_em')
      .single()

    if (erroPacote || !pacote) {
      // Devolve a solicitação à fila: mantê-la como 'aprovada' sem lote nenhum
      // deixaria o cliente pagando e sem crédito, e o admin sem como reaprovar.
      await supabase
        .from('credito_solicitacoes')
        .update({ status: 'pendente', aprovado_por: null, aprovado_em: null })
        .eq('id', reservada.id)

      console.error('[creditos/aprovar] erro ao criar lote:', erroPacote)
      return NextResponse.json({ error: 'Erro ao criar lote de créditos' }, { status: 500 })
    }

    await supabase
      .from('credito_solicitacoes')
      .update({ pacote_id: pacote.id })
      .eq('id', reservada.id)

    // O cliente acabou de comprar a saída: libera na hora, sem esperar a
    // próxima mensagem chegar para o bloqueio cair sozinho. Sem isto o banner
    // continuaria na dashboard logo depois de ele pagar.
    await limparBloqueio(supabase, reservada.tenant_id)

    await notificarCliente(
      supabase, reservada.tenant_id,
      'Créditos liberados',
      `${reservada.quantidade} crédito(s) de atendimento já estão disponíveis. ` +
      `Válidos até ${expiraEm.toLocaleDateString('pt-BR')}.`,
      { solicitacao_id: reservada.id, pacote_id: pacote.id }
    )

    console.log(
      `[creditos/aprovar] tenant=${reservada.tenant_id} +${reservada.quantidade} créditos ` +
      `(R$ ${reservada.valor_total}) lote=${pacote.id} expira=${expiraEm.toISOString()}`
    )

    return NextResponse.json({ solicitacao: reservada, pacote, status: 'aprovada' })
  } catch (err) {
    console.error('[creditos/aprovar] erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * Identifica a origem do lote nos relatórios. Um pedido personalizado que
 * coincide com um pacote fechado é gravado como aquele pacote — foi o mesmo
 * produto vendido pelo mesmo preço.
 */
function origemDoLote(tipo: string, quantidade: number): string {
  const equivalente = CREDITO_EXTRA.pacotes.find((p) => p.creditos === quantidade)
  if (tipo === 'pacote' || equivalente) return equivalente?.id ?? 'pacote'
  return 'personalizado'
}

/** Avisa o cliente pelo sino. Falhar aqui não desfaz o crédito já liberado. */
async function notificarCliente(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  titulo: string,
  mensagem: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const { data: usuarios } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('role', ['admin_tenant', 'self_managed'])

    if (!usuarios?.length) return

    await supabase.from('notifications').insert(
      usuarios.map((u) => ({
        user_id: u.id,
        tenant_id: tenantId,
        tipo: 'creditos',
        titulo,
        mensagem,
        metadata,
        lida: false,
      }))
    )
  } catch (err) {
    console.error('[creditos/aprovar] notificação falhou:', err)
  }
}
