// lib/planos.ts — FONTE ÚNICA DOS PLANOS HUBTEK
// Importar este arquivo em todos os lugares que referenciam planos

export interface Plano {
  value: string
  label: string
  limite: number   // máx conversas/mês
  valor: number    // R$ mensais
}

export const PLANOS: Plano[] = [
  { value: 'essencial',  label: 'Essencial',  limite: 50,   valor: 397   },
  { value: 'acelerador', label: 'Acelerador', limite: 100,  valor: 597   },
  { value: 'dominancia', label: 'Dominância', limite: 500,  valor: 1997  },
  { value: 'elite',      label: 'Elite',      limite: 1000, valor: 3500  },
]

// Record para lookup rápido por value
export const PLANOS_MAP: Record<string, Plano> = Object.fromEntries(
  PLANOS.map(p => [p.value, p])
)

// Ordem dos planos (para upgrade)
export const PLANOS_ORDER = ['essencial', 'acelerador', 'dominancia', 'elite']

export function planoLabel(value: string): string {
  return PLANOS_MAP[value]?.label ?? value
}

export function planoValor(value: string): number {
  return PLANOS_MAP[value]?.valor ?? 0
}

export function planoLimite(value: string): number {
  return PLANOS_MAP[value]?.limite ?? 50
}

/** Retorna o próximo plano acima, ou null se já for elite */
export function proximoPlano(value: string): Plano | null {
  const idx = PLANOS_ORDER.indexOf(value)
  if (idx === -1 || idx === PLANOS_ORDER.length - 1) return null
  return PLANOS_MAP[PLANOS_ORDER[idx + 1]]
}

export const CUSTO_INSTANCIA_EXTRA = 67.00


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
