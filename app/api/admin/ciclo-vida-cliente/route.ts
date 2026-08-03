import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exigirAdminHubtek } from '@/lib/auth/admin'
import {
  estaExpirado,
  statusComercialDe,
  transicaoPermitida,
  type StatusComercial,
} from '@/lib/ciclo-vida'

/**
 * EIXO 1 — transições do ciclo de vida COMERCIAL do cliente.
 *
 *   ativo → cancelado → arquivado
 *
 * Cada passo é uma decisão deliberada do admin_hubtek, e a esteira só anda para
 * a frente. Esta rota NUNCA deleta nada: cancelar e arquivar mexem apenas em
 * `tenants`. Conversas, mensagens, ai_usage, ciclos_fechados e appointments
 * seguem intactos e consultáveis — a exclusão física é exclusividade de
 * /api/admin/expurgar-cliente.
 *
 * Por que virou rota e não continua sendo um update do navegador: a ação
 * anterior ("Bloquear acesso") escrevia `status` direto pelo cliente Supabase,
 * sem validar transição e sem deixar rastro de quem fez. Agora a regra é
 * validada no servidor e cada passo cai em `admin_logs`.
 */

function servico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const guarda = await exigirAdminHubtek()
    if (guarda.erro) return guarda.erro

    const body = await request.json().catch(() => ({}))
    const tenantId: string | undefined = body.tenant_id
    const para = body.para as StatusComercial
    const motivo: string = typeof body.motivo === 'string' ? body.motivo.trim() : ''

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id obrigatório.' }, { status: 400 })
    }
    if (para !== 'cancelado' && para !== 'arquivado' && para !== 'ativo') {
      return NextResponse.json(
        { error: "Destino inválido. Use 'cancelado', 'arquivado' ou 'ativo'." },
        { status: 400 }
      )
    }

    const supabase = servico()

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, nome, status, status_comercial, expira_em')
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    }

    const de = statusComercialDe(tenant.status_comercial)

    if (!transicaoPermitida(de, para)) {
      return NextResponse.json(
        { error: `Transição não permitida: ${de} → ${para}.` },
        { status: 409 }
      )
    }

    // Arquivar é o passo que TIRA o cliente da visão principal. Só depois do
    // fechamento de ciclo, senão o faturamento do último mês fica sem apuração
    // e o cliente some da tela antes de alguém perceber.
    if (para === 'arquivado') {
      const { count } = await supabase
        .from('ciclos_fechados')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)

      if (!count) {
        return NextResponse.json(
          { error: 'Feche o ciclo deste cliente antes de arquivar — não há nenhum fechamento registrado.' },
          { status: 409 }
        )
      }
    }

    const agora = new Date().toISOString()

    // Reativação (cancelado → ativo): sucessora do antigo "Desbloquear acesso".
    // Se o plano também estiver vencido, o agente NÃO é religado — quem manda
    // nisso é a renovação da data, não a reativação comercial. Ligar aqui só
    // criaria um estado que `podeOperar` derruba na primeira mensagem.
    const venceu = estaExpirado(tenant.expira_em)

    const patch =
      para === 'ativo'
        ? {
            status_comercial: 'ativo',
            cancelado_em: null,
            motivo: motivo || null,
            status: 'ativo',
            ...(venceu ? {} : {
              agente_ativo: true,
              pausado_por_admin: false,
              agente_pausado_em: null,
              pausa_por_expiracao: false,
            }),
          }
      : para === 'cancelado'
        ? {
            status_comercial: 'cancelado',
            cancelado_em: agora,
            motivo: motivo || null,
            // Espelho no campo legado: as telas e queries que ainda leem
            // `status` (getTenantBySlug, statusConfig, filtros) continuam
            // enxergando o mesmo estado, sem precisar migrar todas de uma vez.
            status: 'bloqueado',
            // Cancelar tira da operação de fato — era justamente o que
            // "Bloquear acesso" não fazia.
            agente_ativo: false,
            pausado_por_admin: true,
            agente_pausado_em: agora,
            // Explicitamente FALSE: esta pausa é comercial, não de expiração.
            // Se ficasse true, renovar a data do plano religaria um cliente
            // cancelado sem ninguém mandar.
            pausa_por_expiracao: false,
          }
        : {
            status_comercial: 'arquivado',
            arquivado_em: agora,
            arquivado_por: guarda.userId,
            ...(motivo ? { motivo } : {}),
          }

    const { data: aplicado, error: erroUpdate } = await supabase
      .from('tenants')
      .update(patch)
      .eq('id', tenantId)
      // Trava de concorrência: se outra aba já mudou o estado, o update não
      // pega e a transição não é aplicada duas vezes.
      .eq('status_comercial', de)
      .select('id')
      .maybeSingle()

    if (erroUpdate) {
      return NextResponse.json({ error: erroUpdate.message }, { status: 500 })
    }

    // Nenhuma linha casou: o estado mudou entre a leitura e a escrita. Sem esta
    // checagem, o log registraria uma transição que não aconteceu.
    if (!aplicado) {
      return NextResponse.json(
        { error: 'O estado do cliente mudou durante a operação. Recarregue e tente de novo.' },
        { status: 409 }
      )
    }

    await supabase.from('admin_logs').insert({
      admin_user_id: guarda.userId,
      tenant_id: tenantId,
      tenant_nome: tenant.nome,
      acao: para === 'cancelado' ? 'cancelamento' : para === 'ativo' ? 'reativacao' : 'arquivamento',
      de,
      para,
      motivo: motivo || null,
    })

    return NextResponse.json({ success: true, de, para })
  } catch (err) {
    console.error('[ciclo-vida-cliente] falhou:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      { status: 500 }
    )
  }
}
