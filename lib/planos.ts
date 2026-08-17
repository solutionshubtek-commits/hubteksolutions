// lib/planos.ts — FONTE ÚNICA DOS PLANOS HUBTEK
// Importar este arquivo em todos os lugares que referenciam planos

/**
 * Recursos liberáveis por plano.
 *
 * `agente` não entra aqui: atender e responder no WhatsApp é o produto, e
 * existe desde o Iniciante. Só vira flag o que de fato distingue um nível do
 * outro na negociação.
 */
export type RecursoPlano = 'agendamentos' | 'crm'

export interface Plano {
  value: string
  label: string
  limite: number   // atendimentos inclusos por ciclo
  valor: number    // R$ mensais
  /** Recursos liberados. Cada nível acumula os de baixo. */
  recursos: readonly RecursoPlano[]
  /** Operadores ativos permitidos, além do dono da conta. */
  operadores: number
  /** Instâncias de WhatsApp sem custo. Acima disso, CUSTO_INSTANCIA_EXTRA cada. */
  instanciasInclusas: number
}

// Tabela vigente a partir de agosto/2026, junto com os créditos extras. Os
// limites subiram bastante e entrou o Iniciante na base: com o fim do upgrade
// automático, o cliente que estoura a franquia PARA de ser atendido até
// decidir, então uma franquia apertada deixaria de ser um upsell e passaria a
// ser interrupção de serviço.
//
// Limites anteriores, para leitura de dados históricos:
//   essencial 50 · acelerador 100 · dominancia 500 · elite 1000
// Cada nível ACUMULA os recursos do anterior — a lista de `recursos` é escrita
// por extenso, sem herança implícita, para que ler a linha do plano já responda
// o que ele libera, sem precisar montar a soma de cabeça.
export const PLANOS: Plano[] = [
  {
    value: 'iniciante',  label: 'Iniciante',  limite: 50,   valor: 197,
    recursos: [],
    operadores: 1, instanciasInclusas: 1,
  },
  {
    value: 'essencial',  label: 'Essencial',  limite: 120,  valor: 397,
    recursos: ['agendamentos'],
    operadores: 1, instanciasInclusas: 1,
  },
  {
    value: 'acelerador', label: 'Acelerador', limite: 200,  valor: 597,
    recursos: ['agendamentos', 'crm'],
    operadores: 1, instanciasInclusas: 1,
  },
  {
    value: 'dominancia', label: 'Dominância', limite: 700,  valor: 1997,
    recursos: ['agendamentos', 'crm'],
    operadores: 3, instanciasInclusas: 3,
  },
  {
    value: 'elite',      label: 'Elite',      limite: 1300, valor: 3500,
    recursos: ['agendamentos', 'crm'],
    operadores: 10, instanciasInclusas: 5,
  },
]

/** Texto de venda de cada nível — o que ele acrescenta ao anterior. */
export const RESUMO_PLANO: Record<string, string> = {
  iniciante:  'Agente atendendo e respondendo no WhatsApp 24h',
  essencial:  'Tudo do Iniciante, mais agenda, recontato e confirmação de horários',
  acelerador: 'Tudo do Essencial, mais o CRM completo',
  dominancia: 'Tudo do Acelerador, mais 3 instâncias e 3 operadores inclusos',
  elite:      'Operação completa, para alto volume: 5 instâncias e 10 operadores',
}

/** Nome de exibição de cada recurso, para telas de bloqueio e comparativos. */
export const LABEL_RECURSO: Record<RecursoPlano, string> = {
  agendamentos: 'Agendamentos',
  crm:          'CRM',
}

// Record para lookup rápido por value
export const PLANOS_MAP: Record<string, Plano> = Object.fromEntries(
  PLANOS.map(p => [p.value, p])
)

// Ordem dos planos (para upgrade)
export const PLANOS_ORDER = ['iniciante', 'essencial', 'acelerador', 'dominancia', 'elite']

export function planoLabel(value: string): string {
  return PLANOS_MAP[value]?.label ?? value
}

export function planoValor(value: string): number {
  return PLANOS_MAP[value]?.valor ?? 0
}

export function planoLimite(value: string): number {
  return PLANOS_MAP[value]?.limite ?? 50
}

/**
 * O plano libera este recurso?
 *
 * Plano desconhecido cai no mais restrito de propósito: um valor inesperado no
 * banco não pode virar acesso liberado de graça.
 */
export function planoTemRecurso(value: string, recurso: RecursoPlano): boolean {
  return PLANOS_MAP[value]?.recursos.includes(recurso) ?? false
}

/** Operadores ativos permitidos, além do dono da conta. */
export function planoOperadores(value: string): number {
  return PLANOS_MAP[value]?.operadores ?? 1
}

/** Instâncias de WhatsApp sem custo adicional. */
export function planoInstanciasInclusas(value: string): number {
  return PLANOS_MAP[value]?.instanciasInclusas ?? 1
}

/**
 * Primeiro plano da escala que libera o recurso — o alvo do convite de upgrade.
 * Percorre PLANOS_ORDER, e não PLANOS, para não depender da ordem do array.
 */
export function planoMinimoParaRecurso(recurso: RecursoPlano): Plano | null {
  for (const value of PLANOS_ORDER) {
    const p = PLANOS_MAP[value]
    if (p?.recursos.includes(recurso)) return p
  }
  return null
}

/** Retorna o próximo plano acima, ou null se já for elite */
export function proximoPlano(value: string): Plano | null {
  const idx = PLANOS_ORDER.indexOf(value)
  if (idx === -1 || idx === PLANOS_ORDER.length - 1) return null
  return PLANOS_MAP[PLANOS_ORDER[idx + 1]]
}

export const CUSTO_INSTANCIA_EXTRA = 67.00

/**
 * WhatsApp comercial/suporte da Hubtek.
 *
 * Estava repetido cru em renovar-plano e na tela de clientes do admin. Como o
 * modelo novo transforma todo bloqueio em convite para falar conosco, o número
 * passa a aparecer em mais lugares — e trocá-lo não pode virar caça ao literal.
 */
export const WHATSAPP_HUBTEK = '5551980104924'


// ─── Créditos extras de atendimento ──────────────────────────────────────────
// Atendimentos avulsos, vendidos quando a franquia do plano acaba. São mais
// caros que o atendimento incluso de propósito: existem para destravar o mês,
// não para substituir o upgrade de plano.

export interface PacoteCredito {
  id: string
  creditos: number
  valor: number
}

export const CREDITO_EXTRA = {
  valorUnitario: 4.50,
  validadeDias: 90,
  pacotes: [
    { id: 'pacote_20',  creditos: 20,  valor: 90.00  },
    { id: 'pacote_50',  creditos: 50,  valor: 225.00 },
    { id: 'pacote_100', creditos: 100, valor: 450.00 },
  ] as PacoteCredito[],
  permitePersonalizado: true,
} as const

export const PACOTES_CREDITO_MAP: Record<string, PacoteCredito> = Object.fromEntries(
  CREDITO_EXTRA.pacotes.map(p => [p.id, p])
)

/**
 * Valor de uma quantidade personalizada de créditos.
 *
 * Sem desconto por volume: os pacotes fechados já são exatamente
 * quantidade × valorUnitario, então um preço diferente aqui faria o
 * personalizado sair mais barato que o pacote equivalente.
 */
export function valorCreditosPersonalizado(quantidade: number): number {
  return Number((quantidade * CREDITO_EXTRA.valorUnitario).toFixed(2))
}


// ─── Flag de rollback do upgrade automático ──────────────────────────────────
// Com `false`, estourar a franquia bloqueia o atendimento e o cliente escolhe
// (upgrade ou créditos) em vez de subir de plano sozinho.
//
// O código antigo de upgrade continua no lugar, apenas gateado por esta flag,
// para que voltar atrás seja trocar uma linha — e não um revert. Dois pontos
// consultam a flag: o gatilho em app/api/agent/process-webhook/route.ts e o
// executor em app/api/upgrade-plano/route.ts.
//
// Segue `true` até o modo sombra provar que o ledger conta certo (etapa 3).
export const AUTO_UPGRADE_ATIVO = true
