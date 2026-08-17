/**
 * Backfill do ledger de atendimentos (etapa 4 do rollout de créditos extras).
 *
 * Popula `atendimento_consumo` com origem 'franquia' para o ciclo VIGENTE, de
 * modo que o ledger reflita o que já foi atendido no mês antes de o modo
 * sombra existir. Sem isso o ledger começa do zero no meio do ciclo: o delta
 * do shadow vira ruído, e ligar o bloqueio (etapa 8) daria franquia cheia a
 * quem já consumiu o mês inteiro.
 *
 * O QUE CONTA COMO ATENDIMENTO AQUI
 * A regra nova conta contato ATIVO no ciclo, não conversa criada no ciclo —
 * uma conversa reaberta tem `criado_em` antigo e mesmo assim é um atendimento
 * deste mês. Por isso a janela usa a última atividade da conversa, com
 * `criado_em` como reserva para conversa que nunca recebeu mensagem.
 *
 * O TETO DA FRANQUIA
 * Insere no máximo `limite do plano` linhas por tenant, em ordem cronológica:
 * quem foi atendido primeiro consumiu primeiro. Quem passar disso fica DE FORA
 * de propósito — não há franquia nem crédito a que atribuir, e é exatamente
 * esse excedente que seria bloqueado se a etapa 8 já estivesse ativa. O
 * relatório mostra esse número por cliente; ele é a melhor prévia do impacto
 * comercial da mudança.
 *
 * Idempotente: reexecutar não duplica (unique conversation_id + ciclo_ref).
 *
 * Uso:
 *   node scripts/backfill-atendimento-consumo.mjs                    # dry-run, todos
 *   node scripts/backfill-atendimento-consumo.mjs --tenant <uuid>    # dry-run, um
 *   node scripts/backfill-atendimento-consumo.mjs --apply            # grava
 */
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const apply    = process.argv.includes('--apply')
const idxT     = process.argv.indexOf('--tenant')
const tenantVar = idxT !== -1 ? process.argv[idxT + 1] : null

// Espelha PLANOS de lib/planos.ts. Script .mjs não importa o módulo TS, então
// se um limite mudar lá, mude aqui também.
const LIMITES = { iniciante: 50, essencial: 120, acelerador: 200, dominancia: 700, elite: 1300 }
const LIMITE_PADRAO = 50

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=([^\r\n]*)/)
  if (m) env[m[1]] = m[2].trim()
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Mesmo recorte de mesRefAtual() em lib/billing/fechar-ciclo.ts — UTC. */
const agora = new Date()
const CICLO = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`
const inicioCiclo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString()

/** Busca paginada: o cliente do Supabase devolve no máximo 1000 por vez. */
async function todasAsConversas(tenantId) {
  const linhas = []
  const passo = 1000
  for (let de = 0; ; de += passo) {
    const { data, error } = await sb
      .from('conversations')
      .select('id, criado_em, ultima_mensagem_em')
      .eq('tenant_id', tenantId)
      .or(`ultima_mensagem_em.gte.${inicioCiclo},and(ultima_mensagem_em.is.null,criado_em.gte.${inicioCiclo})`)
      .range(de, de + passo - 1)
    if (error) throw new Error(error.message)
    linhas.push(...(data ?? []))
    if (!data || data.length < passo) break
  }
  return linhas
}

console.log(`Ciclo: ${CICLO}  (desde ${inicioCiclo})`)
console.log(apply ? 'MODO: gravando\n' : 'MODO: dry-run (use --apply para gravar)\n')

let query = sb.from('tenants').select('id, nome, plano')
if (tenantVar) query = query.eq('id', tenantVar)
const { data: tenants, error: erroTenants } = await query
if (erroTenants) { console.error('Erro ao listar tenants:', erroTenants.message); process.exit(1) }

let totalInserido = 0, totalExcedente = 0
const excedentesPorCliente = []

for (const t of tenants ?? []) {
  const limite = LIMITES[t.plano] ?? LIMITE_PADRAO

  let conversas
  try {
    conversas = await todasAsConversas(t.id)
  } catch (err) {
    console.log(`${t.nome}: ERRO ao buscar conversas — ${err.message}`)
    continue
  }

  // Cronológico: quem foi atendido primeiro ocupa a franquia primeiro.
  conversas.sort((a, b) =>
    new Date(a.ultima_mensagem_em ?? a.criado_em) - new Date(b.ultima_mensagem_em ?? b.criado_em))

  const { data: jaNoLedger } = await sb
    .from('atendimento_consumo')
    .select('conversation_id')
    .eq('tenant_id', t.id)
    .eq('ciclo_ref', CICLO)

  const registradas = new Set((jaNoLedger ?? []).map(r => r.conversation_id))

  // O que o shadow já gravou ocupa franquia e não é reinserido.
  const vagas = Math.max(0, limite - registradas.size)
  const faltantes = conversas.filter(c => !registradas.has(c.id))
  const aInserir = faltantes.slice(0, vagas)
  const excedente = faltantes.length - aInserir.length

  totalExcedente += excedente
  if (excedente > 0) excedentesPorCliente.push({ nome: t.nome, plano: t.plano, limite, excedente })

  if (aInserir.length && apply) {
    const { error } = await sb.from('atendimento_consumo').upsert(
      aInserir.map(c => ({
        tenant_id: t.id,
        conversation_id: c.id,
        ciclo_ref: CICLO,
        origem: 'franquia',
        consumido_em: c.ultima_mensagem_em ?? c.criado_em,
      })),
      { onConflict: 'conversation_id,ciclo_ref', ignoreDuplicates: true }
    )
    if (error) { console.log(`${t.nome}: ERRO ao gravar — ${error.message}`); continue }
  }

  totalInserido += aInserir.length
  const marca = excedente > 0 ? '  <-- ESTOURA A FRANQUIA' : ''
  console.log(
    `${t.nome} [${t.plano}/${limite}]: ativas=${conversas.length} ` +
    `ja_no_ledger=${registradas.size} inserir=${aInserir.length} excedente=${excedente}${marca}`
  )
}

console.log(`\n${apply ? 'Inseridas' : 'Seriam inseridas'}: ${totalInserido} linha(s)`)

if (excedentesPorCliente.length) {
  console.log(`\nATENCAO — ${totalExcedente} atendimento(s) acima da franquia, em ${excedentesPorCliente.length} cliente(s).`)
  console.log('Estes seriam BLOQUEADOS hoje se a etapa 8 estivesse ativa:')
  for (const e of excedentesPorCliente) {
    console.log(`  - ${e.nome} (${e.plano}, franquia ${e.limite}): ${e.excedente} acima`)
  }
  console.log('\nResolver comercialmente (upgrade ou credito) ANTES de ligar o bloqueio.')
} else {
  console.log('\nNenhum cliente acima da franquia neste ciclo.')
}
