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
