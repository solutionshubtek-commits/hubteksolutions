/**
 * Ciclo de vida do cliente — regras compartilhadas dos DOIS eixos.
 *
 * EIXO 1 (comercial, manual):   ativo → cancelado → arquivado → expurgado
 * EIXO 2 (operacional, automático): plano vencido → agente pausado, reversível
 *
 * Este módulo é puro de propósito: não importa Supabase nem nada de servidor,
 * porque é consumido pelo middleware (Edge), por rotas de API, pelo cron e por
 * componentes de cliente. Se um deles calcular "expirado" de um jeito
 * diferente dos outros, o sistema volta a mostrar um estado e a se comportar
 * como outro — que é exatamente o bug que este trabalho fecha.
 */

/**
 * Retenção legal antes do expurgo físico (exigência fiscal/jurídica brasileira
 * para dados financeiros). Nada de prazo hardcoded espalhado pelo código.
 */
export const RETENCAO_ANOS = 5

export type StatusComercial = 'ativo' | 'cancelado' | 'arquivado'

/**
 * A esteira anda para a frente: ativo → cancelado → arquivado → (expurgo).
 *
 * A única volta permitida é cancelado → ativo, e ela existe porque já existia:
 * a tela admin sempre teve "Desbloquear acesso" e tirar isso seria perder uma
 * capacidade em uso. Arquivado NÃO volta — depois que o cliente saiu da visão
 * principal com o ciclo fechado, reabrir é decisão de cadastro, não um botão.
 */
export const TRANSICOES_PERMITIDAS: Record<StatusComercial, StatusComercial[]> = {
  ativo:     ['cancelado'],
  cancelado: ['arquivado', 'ativo'],
  arquivado: [],
}

export function transicaoPermitida(de: StatusComercial, para: StatusComercial): boolean {
  return TRANSICOES_PERMITIDAS[de]?.includes(para) ?? false
}

/**
 * Dias até a expiração — negativo se já venceu, `null` se o cliente não tem
 * prazo definido.
 *
 * O `Math.ceil` é intencional e replica o que as telas admin já faziam
 * (`diasRestantes` em admin/clientes e `diasAteExpirar` em admin/visao-geral):
 * o cliente só é considerado vencido depois que o dia da expiração passa
 * inteiro, não às 00:01. Manter a mesma conta em todo lugar vale mais do que
 * escolher um limite "melhor" e passar a divergir dos badges existentes.
 */
export function diasAteExpirar(expiraEm: string | null | undefined): number | null {
  if (!expiraEm) return null
  return Math.ceil((new Date(expiraEm).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export function estaExpirado(expiraEm: string | null | undefined): boolean {
  const dias = diasAteExpirar(expiraEm)
  return dias !== null && dias < 0
}

/** Janela de aviso das telas admin: vence em até 10 dias, mas ainda não venceu. */
export function estaExpirando(expiraEm: string | null | undefined, janelaDias = 10): boolean {
  const dias = diasAteExpirar(expiraEm)
  return dias !== null && dias >= 0 && dias <= janelaDias
}

/**
 * Um cliente sem prazo (`expira_em` nulo) NÃO é tratado como expirado — é o
 * caso de conta interna ou contrato sem data. Só vence quem tem data vencida.
 */
export function statusComercialDe(valor: string | null | undefined): StatusComercial {
  return valor === 'cancelado' || valor === 'arquivado' ? valor : 'ativo'
}

export interface EstadoTenant {
  status_comercial?: string | null
  expira_em?: string | null
}

/**
 * O agente pode atender? Só considera os dois eixos de estado — a pausa
 * explícita (`agente_ativo`, `pausado_por_admin`) é avaliada por quem chama,
 * porque tem origem diferente.
 */
export function podeOperar(tenant: EstadoTenant): boolean {
  if (statusComercialDe(tenant.status_comercial) !== 'ativo') return false
  if (estaExpirado(tenant.expira_em)) return false
  return true
}

/** Data em que um cliente arquivado passa a ser elegível ao expurgo físico. */
export function elegivelParaExpurgoEm(arquivadoEm: string): Date {
  const d = new Date(arquivadoEm)
  d.setFullYear(d.getFullYear() + RETENCAO_ANOS)
  return d
}

/**
 * Por que o acesso está bloqueado — ou `null` quando o cliente pode operar.
 *
 * Existe para que as telas e as rotas de API digam ao usuário a MESMA coisa
 * que `podeOperar` decidiu, em vez de cada uma reconstruir o motivo (e errar a
 * ordem de precedência: cancelado vence expirado, porque um cliente cancelado
 * cujo plano também venceu não deve ser convidado a renovar).
 */
export type MotivoBloqueio = 'cancelado' | 'arquivado' | 'expirado'

export function motivoBloqueio(tenant: EstadoTenant): MotivoBloqueio | null {
  const comercial = statusComercialDe(tenant.status_comercial)
  if (comercial !== 'ativo') return comercial
  if (estaExpirado(tenant.expira_em)) return 'expirado'
  return null
}

export interface EstadoAgente extends EstadoTenant {
  agente_ativo?: boolean | null
  pausado_por_admin?: boolean | null
}

/**
 * O agente está de fato atendendo? Estado DERIVADO, nunca persistido.
 *
 * Esta é a mudança central do ciclo de vida: o vencimento do plano não escreve
 * mais nada em `agente_ativo`. Ele não precisa — o agente para porque
 * `podeOperar` é falso, e volta sozinho no instante em que o plano é renovado.
 *
 * Antes, o cron pausava o agente escrevendo `agente_ativo = false`. Isso criava
 * dois problemas que apareceram em produção:
 *
 *  1. Quem já estava com o agente desligado por escolha própria não tinha a
 *     pausa marcada como "por expiração", e a renovação (que só religa
 *     `pausa_por_expiracao = true`) deixava o cliente renovado com o agente
 *     mudo, sem ninguém entender por quê.
 *  2. A pausa comercial e a preferência do cliente disputavam a mesma coluna,
 *     então religar uma sempre corria o risco de apagar a outra.
 *
 * Com o estado derivado, `agente_ativo` volta a significar só uma coisa — o que
 * o CLIENTE escolheu — e o plano é avaliado por cima, a cada consulta.
 */
export function agenteOperando(tenant: EstadoAgente): boolean {
  if (!podeOperar(tenant)) return false
  if (tenant.pausado_por_admin) return false
  return tenant.agente_ativo ?? true
}

// ─── Reconhecimento de receita ──────────────────────────────────────────────
//
// Terceiro eixo, e o mais recente: os dois primeiros dizem se o cliente PODE
// operar; este diz se aquele mês vira dinheiro. São independentes — uma conta
// demo opera normalmente e nunca fatura; um cliente vencido não opera e mesmo
// assim pode ter faturado o mês em que venceu.

export type MotivoSemReceita = 'conta_demo' | 'cortesia' | 'sem_acesso'

export interface EstadoFaturamento {
  conta_demo?: boolean | null
  faturamento_cortesia_ate?: string | null
  status_comercial?: string | null
  expira_em?: string | null
}

/**
 * A mensalidade daquele ciclo vira receita? E, se não, por quê.
 *
 * Existe porque o fechamento tratava mensalidade CONTRATADA como receita
 * REALIZADA. A margem estimada somava R$ 3.500/mês da conta demo da própria
 * Hubtek e os meses de bônus de implantação de um cliente — dinheiro que nunca
 * entrou. O custo continuava certo; a receita, não.
 *
 * A decisão usa o estado do cliente NAQUELE mês, não o de hoje: quem pagou de
 * janeiro a junho e venceu em julho mantém a receita de jan-jun. Reavaliar o
 * passado pelo presente faria a margem histórica mudar sozinha a cada
 * vencimento e a cada renovação.
 *
 * Precedência: conta demo (nunca fatura) > cortesia (bônus combinado) > sem
 * acesso (cancelado, ou vencido durante o mês inteiro).
 */
export function motivoSemReceitaDoCiclo(
  tenant: EstadoFaturamento,
  mesRef: string
): MotivoSemReceita | null {
  if (tenant.conta_demo === true) return 'conta_demo'

  const [ano, mes] = mesRef.split('-').map(Number)
  const inicioDoMes = new Date(Date.UTC(ano, mes - 1, 1))

  // O ciclo está na cortesia quando o mês COMEÇA dentro dela. Um bônus que
  // termina no dia 20 cobre o mês inteiro: cobrar 10 dias quebrados não é o
  // que se combina com o cliente na implantação.
  if (tenant.faturamento_cortesia_ate) {
    const limite = new Date(`${tenant.faturamento_cortesia_ate}T23:59:59Z`)
    if (inicioDoMes.getTime() <= limite.getTime()) return 'cortesia'
  }

  // Cancelado/arquivado: não há o que cobrar do mês.
  if (tenant.status_comercial === 'cancelado' || tenant.status_comercial === 'arquivado') {
    return 'sem_acesso'
  }

  // Vencido ANTES de o mês começar — passou o mês inteiro sem acesso. Vencer no
  // meio do mês continua faturando: o cliente usou parte do período, e cobrar
  // proporcional é decisão comercial, não do fechamento.
  if (tenant.expira_em && new Date(tenant.expira_em).getTime() < inicioDoMes.getTime()) {
    return 'sem_acesso'
  }

  return null
}
