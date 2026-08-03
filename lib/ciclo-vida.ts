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
