// lib/creditos.ts — consumo de atendimento e saldo de créditos extras
//
// Camada fina sobre a RPC `consumir_atendimento` (migration 011). Toda a
// decisão de "pode atender?" mora no banco, onde a idempotência e o lock por
// tenant são garantidos; aqui só montamos os argumentos e traduzimos o
// resultado. Manter assim mantém o process-message enxuto e impede que a regra
// de prioridade (franquia → crédito → bloqueio) seja reescrita em TypeScript.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { mesRefAtual } from '@/lib/billing/fechar-ciclo'
import { planoLimite } from '@/lib/planos'

export type OrigemConsumo = 'franquia' | 'credito' | 'bloqueado'

export interface ResultadoConsumo {
  permitido: boolean
  origem: OrigemConsumo
  pacoteId: string | null
  /**
   * Saldos após este consumo. Vêm `null` quando a conversa já havia consumido
   * neste ciclo: nesse caso a chamada não alterou nada, e devolver um número
   * daria a impressão de um consumo novo. Quem precisa do saldo exato nessa
   * situação chama `getSaldo`.
   */
  saldoFranquia: number | null
  saldoCreditos: number | null
}

export interface Saldo {
  franquiaTotal: number
  franquiaUsada: number
  franquiaRestante: number
  creditosRestantes: number
  totalDisponivel: number
}

/**
 * Identificador do ciclo vigente, no formato 'AAAA-MM'.
 *
 * Delega a `mesRefAtual` de propósito: é o mesmo valor que o fechamento mensal
 * grava em `ciclos_fechados.mes_ref` e que `ai_usage.ciclo_mes` usa. Se o
 * `ciclo_ref` do ledger divergisse desse recorte, o consumo faturado e o
 * relatório do mês passariam a contar janelas diferentes.
 *
 * Atenção a uma divergência que já existe no código legado: a contagem do
 * auto-upgrade (process-webhook e upgrade-plano) monta o início do mês em
 * UTC-3, enquanto `mesRefAtual` trabalha em UTC puro. São 3 horas em que, na
 * virada do dia 1º, os dois caminhos discordam de qual mês a conversa é. O
 * modo sombra da etapa 3 vai expor isso como divergência — é esperado, e o
 * lado certo é este aqui, que acompanha o fechamento.
 */
export function getCicloRef(base = new Date()): string {
  return mesRefAtual(base)
}

/** Franquia mensal do plano — o `limite` de lib/planos.ts, com nome de negócio. */
export function getFranquiaAtual(plano: string): number {
  return planoLimite(plano)
}

/** Plano vigente do tenant, com o mesmo default do resto do código. */
async function getPlanoDoTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string> {
  const { data } = await supabase
    .from('tenants')
    .select('plano')
    .eq('id', tenantId)
    .single()

  return (data as { plano?: string } | null)?.plano ?? 'essencial'
}

/**
 * Consome 1 atendimento para esta conversa no ciclo corrente.
 *
 * Idempotente por (conversa, ciclo): chamar duas vezes para a mesma conversa
 * no mesmo mês devolve o consumo original sem debitar de novo. É essa garantia
 * — no banco, não no Redis — que protege dos webhooks duplicados da Evolution.
 *
 * Deve ser chamada em UM ÚNICO ponto do pipeline, onde a conversa nasce.
 * Um segundo ponto de chamada contaria o mesmo atendimento duas vezes em
 * ciclos diferentes.
 *
 * @param plano Passe se já tiver em mãos; evita uma consulta a `tenants`.
 */
export async function consumirAtendimento(
  tenantId: string,
  conversationId: string,
  plano?: string,
  client?: SupabaseClient
): Promise<ResultadoConsumo> {
  const supabase = client ?? createServiceClient()
  const planoAtual = plano ?? await getPlanoDoTenant(supabase, tenantId)

  const { data, error } = await supabase.rpc('consumir_atendimento', {
    p_tenant_id: tenantId,
    p_conversation_id: conversationId,
    p_ciclo_ref: getCicloRef(),
    p_franquia: getFranquiaAtual(planoAtual),
  })

  if (error) throw new Error(`consumir_atendimento falhou: ${error.message}`)

  // A RPC retorna TABLE, então o supabase-js entrega um array de uma linha.
  const linha = Array.isArray(data) ? data[0] : data
  if (!linha) throw new Error('consumir_atendimento não retornou linha')

  return {
    permitido:     linha.permitido === true,
    origem:        linha.origem as OrigemConsumo,
    pacoteId:      linha.pacote_id ?? null,
    saldoFranquia: linha.saldo_franquia ?? null,
    saldoCreditos: linha.saldo_creditos ?? null,
  }
}

/**
 * Contagem do caminho LEGADO: conversas criadas no mês corrente.
 *
 * Replica exatamente o cálculo que process-webhook e upgrade-plano fazem hoje,
 * incluindo o início de mês em UTC-3 — inclusive a divergência de 3 horas em
 * relação ao `ciclo_ref`. Existe só para a comparação do modo sombra e sai
 * junto com o auto-upgrade.
 */
async function contarConversasLegado(
  supabase: SupabaseClient,
  tenantId: string
): Promise<number> {
  const agora3 = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const inicioMes = new Date(Date.UTC(agora3.getUTCFullYear(), agora3.getUTCMonth(), 1, 3, 0, 0))

  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('criado_em', inicioMes.toISOString())

  return count ?? 0
}

/**
 * MODO SOMBRA — etapa 3 do rollout.
 *
 * Registra o consumo no ledger e compara com a contagem legada, SEM bloquear
 * ninguém e sem alterar o que o agente faz. O objetivo é medir, por um ciclo
 * inteiro, o quanto o caminho novo diverge do atual antes de ele ganhar poder
 * de recusar atendimento.
 *
 * Divergência POSITIVA é esperada, não é bug: o legado conta conversas criadas
 * no mês (`criado_em`), enquanto o ledger conta contatos atendidos no ciclo —
 * e uma conversa reaberta tem `criado_em` antigo, então some da contagem
 * legada e aparece na nova. O tamanho desse delta é justamente a informação
 * que precisamos: ele é o aumento de consumo que os clientes vão sentir.
 *
 * Nunca lança. Uma falha aqui não pode derrubar um atendimento real — durante
 * o shadow este código é observação pura, e observação não quebra produção.
 */
export async function registrarConsumoSombra(
  supabase: SupabaseClient,
  tenantId: string,
  conversationId: string,
  plano?: string
): Promise<void> {
  try {
    const planoAtual = plano ?? await getPlanoDoTenant(supabase, tenantId)
    const franquiaTotal = getFranquiaAtual(planoAtual)
    const r = await consumirAtendimento(tenantId, conversationId, planoAtual, supabase)

    // Conversa já contada neste ciclo: nada mudou, e comparar de novo só
    // gastaria uma consulta por mensagem recebida. Sai em silêncio.
    if (r.permitido && r.saldoFranquia === null && r.saldoCreditos === null) return

    if (!r.permitido) {
      // No shadow ninguém é barrado — este log é a medida de quantos
      // atendimentos SERIAM recusados se a etapa 8 já estivesse ativa.
      console.log(
        `[shadow-creditos] BLOQUEARIA tenant=${tenantId} conversa=${conversationId} ` +
        `ciclo=${getCicloRef()} franquia=${franquiaTotal} (sem saldo)`
      )
      return
    }

    const usadoLedger = r.origem === 'franquia'
      ? franquiaTotal - (r.saldoFranquia ?? 0)
      : franquiaTotal
    const usadoLegado = await contarConversasLegado(supabase, tenantId)
    const delta = usadoLedger - usadoLegado

    console.log(
      `[shadow-creditos] tenant=${tenantId} ciclo=${getCicloRef()} origem=${r.origem} ` +
      `ledger=${usadoLedger} legado=${usadoLegado} delta=${delta >= 0 ? '+' : ''}${delta} ` +
      `franquia=${franquiaTotal} creditos=${r.saldoCreditos ?? 0}`
    )
  } catch (err) {
    console.error('[shadow-creditos] falhou (ignorado, atendimento segue):', err)
  }
}

/**
 * Consome o atendimento e devolve se o agente pode responder.
 *
 * Substitui o modo sombra (etapa 3) como decisão real. Mantém o registro de
 * divergência no log durante a transição, para continuar comparando com o
 * caminho legado enquanto o auto-upgrade ainda existe atrás da flag.
 *
 * NUNCA lança: uma falha de infraestrutura aqui não pode calar o agente de um
 * cliente que está em dia. Em caso de erro, libera o atendimento e registra —
 * o prejuízo de atender um a mais é muito menor que o de recusar quem pagou.
 */
export async function consumirOuBloquear(
  supabase: SupabaseClient,
  tenantId: string,
  conversationId: string,
  plano?: string
): Promise<{ permitido: boolean; origem: OrigemConsumo }> {
  try {
    const planoAtual = plano ?? await getPlanoDoTenant(supabase, tenantId)
    const r = await consumirAtendimento(tenantId, conversationId, planoAtual, supabase)

    if (r.permitido) {
      // Conversa nova consumida com sucesso: se o tenant estava marcado como
      // bloqueado, a marca está velha (comprou crédito, subiu de plano ou
      // virou o ciclo). Limpa para o banner sumir da dashboard.
      if (r.saldoFranquia !== null || r.saldoCreditos !== null) {
        await limparBloqueio(supabase, tenantId).catch(() => {})
      }
      return { permitido: true, origem: r.origem }
    }

    const { jaEstava } = await marcarBloqueio(supabase, tenantId)

    // Só avisa na transição. Sem isso o dono da conta receberia um e-mail e um
    // sino por MENSAGEM recebida enquanto estivesse bloqueado — o aviso viraria
    // spam e deixaria de ser lido justamente quando mais importa.
    if (!jaEstava) {
      await notificarBloqueio(supabase, tenantId).catch(err =>
        console.error('[creditos] aviso de bloqueio falhou:', err))
    }

    console.log(
      `[creditos] BLOQUEADO tenant=${tenantId} conversa=${conversationId} ` +
      `ciclo=${getCicloRef()} — franquia e créditos esgotados`
    )
    return { permitido: false, origem: 'bloqueado' }
  } catch (err) {
    console.error('[creditos] consumo falhou — atendimento LIBERADO por segurança:', err)
    return { permitido: true, origem: 'franquia' }
  }
}

/**
 * Marca o tenant como bloqueado. Idempotente: se já estava, não mexe em
 * `bloqueado_em`, senão o "avisado há X" reiniciaria a cada mensagem e o
 * cliente receberia a notificação em loop.
 */
export async function marcarBloqueio(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ jaEstava: boolean }> {
  const { data } = await supabase
    .from('tenants')
    .select('atendimento_bloqueado')
    .eq('id', tenantId)
    .single()

  if ((data as { atendimento_bloqueado?: boolean } | null)?.atendimento_bloqueado) {
    return { jaEstava: true }
  }

  await supabase
    .from('tenants')
    .update({ atendimento_bloqueado: true, bloqueado_em: new Date().toISOString() })
    .eq('id', tenantId)

  return { jaEstava: false }
}

/**
 * Avisa o dono da conta que o atendimento parou: sino na dashboard + e-mail.
 *
 * O e-mail existe porque o bloqueio acontece enquanto ninguém está olhando a
 * dashboard — normalmente fora do horário comercial, que é quando o volume
 * sobe. Um sino que só é visto no dia seguinte custa um dia de atendimento.
 */
async function notificarBloqueio(
  supabase: SupabaseClient,
  tenantId: string
): Promise<void> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('nome, plano')
    .eq('id', tenantId)
    .single()

  const t = tenant as { nome?: string; plano?: string } | null
  const franquia = getFranquiaAtual(t?.plano ?? 'essencial')

  const { data: donos } = await supabase
    .from('users')
    .select('id, email, nome')
    .eq('tenant_id', tenantId)
    .in('role', ['admin_tenant', 'self_managed'])
    .eq('ativo', true)

  if (!donos?.length) return

  await supabase.from('notifications').insert(
    donos.map(d => ({
      user_id: d.id,
      tenant_id: tenantId,
      tipo: 'atendimento_bloqueado',
      titulo: 'Atendimentos pausados — limite do plano atingido',
      mensagem:
        `Você usou os ${franquia} atendimentos do seu plano neste ciclo e não há créditos ` +
        `extras. O agente não vai responder novas conversas até você adicionar créditos ou ` +
        `subir de plano. As conversas já em andamento seguem normalmente.`,
      metadata: { franquia, ciclo: getCicloRef() },
      lida: false,
    }))
  )

  const destinos = donos.map(d => (d as { email?: string }).email).filter(Boolean) as string[]
  if (!destinos.length) return

  // Import dinâmico: lib/resend/client lança na carga se RESEND_API_KEY não
  // existir, e isso derrubaria o pipeline do agente inteiro num ambiente sem
  // e-mail configurado. Aqui a falha fica contida neste aviso.
  const { resend } = await import('@/lib/resend/client')

  await resend.emails.send({
    from: 'Hubtek Solutions <noreply@hubteksolutions.tech>',
    to: destinos,
    subject: 'Seus atendimentos foram pausados — limite do plano atingido',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#B45309;margin-bottom:4px;">Atendimentos pausados</h2>
        <p style="color:#444;line-height:1.6;">
          Olá! O agente de <strong>${t?.nome ?? 'sua conta'}</strong> atingiu os
          <strong>${franquia} atendimentos</strong> inclusos no plano neste ciclo,
          e não há créditos extras disponíveis.
        </p>
        <p style="color:#444;line-height:1.6;">
          A partir de agora ele <strong>não responde novas conversas</strong>. Quem já
          estava conversando continua sendo atendido normalmente, e nenhuma mensagem
          é perdida — elas ficam registradas na plataforma para sua equipe responder.
        </p>
        <p style="color:#444;line-height:1.6;">Para voltar ao normal você pode:</p>
        <ul style="color:#444;line-height:1.8;">
          <li><strong>Adicionar créditos extras</strong> pela dashboard, a partir de R$ 4,50 por atendimento</li>
          <li><strong>Subir de plano</strong>, falando com a gente</li>
        </ul>
        <p style="color:#666;font-size:13px;line-height:1.6;margin-top:20px;">
          Na virada do mês sua franquia é renovada e o atendimento volta sozinho.
        </p>
      </div>`,
  })
}

/** Libera o tenant. Chamado ao aprovar créditos, subir plano ou virar ciclo. */
export async function limparBloqueio(
  supabase: SupabaseClient,
  tenantId: string
): Promise<void> {
  await supabase
    .from('tenants')
    .update({ atendimento_bloqueado: false, bloqueado_em: null })
    .eq('id', tenantId)
    .eq('atendimento_bloqueado', true)
}

/**
 * Saldo do tenant: quanto sobrou da franquia neste ciclo e quantos créditos
 * comprados ainda valem. Só leitura — não consome nada.
 *
 * `franquiaRestante` nunca vem negativo: quando o ledger já registrou mais
 * franquia do que o plano prevê (rebaixamento de plano no meio do ciclo, por
 * exemplo), o excedente não vira dívida na tela.
 */
export async function getSaldo(
  tenantId: string,
  plano?: string,
  client?: SupabaseClient
): Promise<Saldo> {
  const supabase = client ?? createServiceClient()
  const planoAtual = plano ?? await getPlanoDoTenant(supabase, tenantId)
  const franquiaTotal = getFranquiaAtual(planoAtual)

  const { count, error: erroConsumo } = await supabase
    .from('atendimento_consumo')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('ciclo_ref', getCicloRef())
    .eq('origem', 'franquia')

  if (erroConsumo) throw new Error(`saldo de franquia falhou: ${erroConsumo.message}`)

  const { data: pacotes, error: erroPacotes } = await supabase
    .from('credito_pacotes')
    .select('quantidade_restante')
    .eq('tenant_id', tenantId)
    .eq('status', 'ativo')
    .gt('expira_em', new Date().toISOString())

  if (erroPacotes) throw new Error(`saldo de créditos falhou: ${erroPacotes.message}`)

  const franquiaUsada = count ?? 0
  const franquiaRestante = Math.max(0, franquiaTotal - franquiaUsada)
  const creditosRestantes = (pacotes ?? []).reduce(
    (soma, p) => soma + ((p as { quantidade_restante: number }).quantidade_restante ?? 0),
    0
  )

  return {
    franquiaTotal,
    franquiaUsada,
    franquiaRestante,
    creditosRestantes,
    totalDisponivel: franquiaRestante + creditosRestantes,
  }
}
