/**
 * Horário de funcionamento — fonte única de verdade.
 *
 * Antes existiam apenas `horario_inicio` e `horario_fim`: uma janela contínua,
 * igual todos os dias. Empresas que param para o almoço ou atendem em horário
 * diferente no fim de semana não tinham como representar isso, e o agente
 * oferecia horários que a empresa não atende.
 *
 * MODELO — aditivo de propósito, para não quebrar nada do que já funciona:
 *
 *   horario_inicio ..... abertura (permanece a mesma coluna de sempre)
 *   horario_fim ........ fechamento (idem)
 *   intervalo_inicio ... início da pausa (almoço). NULL = sem pausa.
 *   intervalo_fim ...... fim da pausa. NULL = sem pausa.
 *
 * Com os dois campos de intervalo nulos, `janelasDoDia` devolve exatamente a
 * janela única de antes — o comportamento legado é o caso-base, não um desvio.
 * Isso vale inclusive para tenants que nunca abrirem a tela de treinamento.
 *
 * `horario_inicio`/`horario_fim` seguem representando o ENVELOPE do dia
 * (primeira abertura até o último fechamento), então qualquer código que ainda
 * leia só esses dois campos continua vendo um intervalo correto — apenas mais
 * largo, por desconhecer a pausa.
 */

export interface JanelaHorario {
  inicio: string // 'HH:MM'
  fim: string    // 'HH:MM'
}

/** Subconjunto de agent_config que descreve horários. Tudo novo é opcional. */
export interface ConfigHorarios {
  horario_inicio: string
  horario_fim: string
  dias_funcionamento: string[]
  horario_intervalo_inicio?: string | null
  horario_intervalo_fim?: string | null
  fds_horario_diferente?: boolean | null
  horario_fds_inicio?: string | null
  horario_fds_fim?: string | null
  horario_fds_intervalo_inicio?: string | null
  horario_fds_intervalo_fim?: string | null
}

export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const
export const DIAS_FDS = ['sab', 'dom']

const DIAS_LABEL: Record<string, string> = {
  seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta',
  sex: 'Sexta', sab: 'Sábado', dom: 'Domingo',
}

/** 'HH:MM' ou 'HH:MM:SS' → minutos desde a meia-noite. NaN vira null. */
export function paraMinutos(hora: string | null | undefined): number | null {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/** Normaliza para 'HH:MM' — o Postgres devolve `time` como 'HH:MM:SS'. */
export function paraHHMM(hora: string | null | undefined): string | null {
  if (!hora) return null
  const partes = hora.split(':')
  if (partes.length < 2) return null
  return `${partes[0].padStart(2, '0')}:${partes[1].padStart(2, '0')}`
}

function ehFimDeSemana(diaSemana: string): boolean {
  return DIAS_FDS.includes(diaSemana)
}

/**
 * Janelas de atendimento de um dia da semana ('seg'..'dom').
 *
 * Devolve [] quando a empresa não atende no dia. Devolve uma janela quando não
 * há pausa, e duas quando há. É a função que todo o resto consulta — geração de
 * slots, checagem de "estamos abertos agora" e o texto do prompt.
 */
export function janelasDoDia(config: ConfigHorarios, diaSemana: string): JanelaHorario[] {
  if (!config.dias_funcionamento?.includes(diaSemana)) return []

  const usaFds = Boolean(config.fds_horario_diferente) && ehFimDeSemana(diaSemana)

  const inicio = paraHHMM(usaFds ? config.horario_fds_inicio : config.horario_inicio)
                 ?? paraHHMM(config.horario_inicio)
  const fim    = paraHHMM(usaFds ? config.horario_fds_fim : config.horario_fim)
                 ?? paraHHMM(config.horario_fim)

  if (!inicio || !fim) return []

  const pausaInicio = paraHHMM(usaFds ? config.horario_fds_intervalo_inicio : config.horario_intervalo_inicio)
  const pausaFim    = paraHHMM(usaFds ? config.horario_fds_intervalo_fim : config.horario_intervalo_fim)

  const mInicio = paraMinutos(inicio)!
  const mFim    = paraMinutos(fim)!
  if (mFim <= mInicio) return []

  const mPausaInicio = paraMinutos(pausaInicio)
  const mPausaFim    = paraMinutos(pausaFim)

  // A pausa só divide o dia se estiver completa e realmente DENTRO da janela.
  // Preenchimento parcial ou incoerente é ignorado em vez de gerar janela
  // inválida — vale mais devolver o horário cheio que sumir com a agenda.
  const pausaValida =
    mPausaInicio !== null && mPausaFim !== null &&
    mPausaFim > mPausaInicio &&
    mPausaInicio > mInicio && mPausaFim < mFim

  if (!pausaValida) return [{ inicio, fim }]

  return [
    { inicio, fim: pausaInicio! },
    { inicio: pausaFim!, fim },
  ]
}

/** A empresa está atendendo neste instante? `agora` deve estar em horário de Brasília. */
export function dentroDoHorario(config: ConfigHorarios, agora: Date): boolean {
  const diaSemana = DIAS_SEMANA[agora.getUTCDay()]
  const janelas = janelasDoDia(config, diaSemana)
  if (janelas.length === 0) return false

  const minutoAtual = agora.getUTCHours() * 60 + agora.getUTCMinutes()
  return janelas.some(j => {
    const i = paraMinutos(j.inicio)!
    const f = paraMinutos(j.fim)!
    return minutoAtual >= i && minutoAtual < f
  })
}

/**
 * Slots de atendimento de um dia, em minutos desde a meia-noite.
 * Gera dentro de CADA janela, então nenhum slot cai no intervalo de almoço.
 */
export function slotsDoDia(
  config: ConfigHorarios,
  diaSemana: string,
  duracaoMinutos: number
): Array<{ inicio: number; fim: number }> {
  const slots: Array<{ inicio: number; fim: number }> = []
  for (const janela of janelasDoDia(config, diaSemana)) {
    const i = paraMinutos(janela.inicio)!
    const f = paraMinutos(janela.fim)!
    for (let t = i; t + duracaoMinutos <= f; t += duracaoMinutos) {
      slots.push({ inicio: t, fim: t + duracaoMinutos })
    }
  }
  return slots
}

/**
 * Descrição do horário para o prompt do agente.
 *
 * Agrupa dias com o mesmo horário para não gerar sete linhas quase iguais —
 * texto repetitivo consome contexto e o modelo segue pior.
 */
export function descreverHorarios(config: ConfigHorarios): string {
  const dias = DIAS_SEMANA.filter(d => config.dias_funcionamento?.includes(d))
  if (dias.length === 0) return 'A empresa não tem dias de funcionamento cadastrados.'

  const porHorario = new Map<string, string[]>()
  for (const dia of dias) {
    const janelas = janelasDoDia(config, dia)
    if (janelas.length === 0) continue
    const chave = janelas.map(j => `${j.inicio} às ${j.fim}`).join(' e das ')
    porHorario.set(chave, [...(porHorario.get(chave) ?? []), DIAS_LABEL[dia] ?? dia])
  }

  return Array.from(porHorario.entries())
    .map(([horario, listaDias]) => `${listaDias.join(', ')}: das ${horario}`)
    .join('; ')
}
