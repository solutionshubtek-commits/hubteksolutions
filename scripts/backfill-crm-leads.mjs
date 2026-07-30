/**
 * Backfill de leads do CRM.
 *
 * Cria um registro em `crm_leads` para toda conversa do tenant que ficou sem
 * lead. Isso acontecia quando um operador assumia a conversa antes de o agente
 * responder: o upsert do lead rodava depois do return de "conversa pausada" em
 * process-message.ts, então o contato nunca entrava no funil. A ordem já foi
 * corrigida — este script cobre o passivo anterior à correção.
 *
 * Uso:
 *   node scripts/backfill-crm-leads.mjs <tenant_id>            # dry-run
 *   node scripts/backfill-crm-leads.mjs <tenant_id> --apply    # grava
 */
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const ETAPA_INICIAL = {
  vendas:       'novo_contato',
  suporte:      'aberto',
  agendamentos: 'novo_contato',
  qualificacao: 'novo_lead',
}

const tenantId = process.argv[2]
const apply    = process.argv.includes('--apply')

if (!tenantId) {
  console.error('Uso: node scripts/backfill-crm-leads.mjs <tenant_id> [--apply]')
  process.exit(1)
}

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=([^\r\n]*)/)
  if (m) env[m[1]] = m[2].trim()
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: cfg } = await sb
  .from('agent_config').select('funcoes_ativas').eq('tenant_id', tenantId).maybeSingle()

const funil = (cfg?.funcoes_ativas ?? [])[0]
const etapaInicial = ETAPA_INICIAL[funil]
if (!etapaInicial) {
  console.error(`Tenant sem funil válido configurado (funcoes_ativas: ${JSON.stringify(cfg?.funcoes_ativas)})`)
  process.exit(1)
}

const { data: convs } = await sb
  .from('conversations')
  .select('id, contato_nome, contato_telefone, criado_em')
  .eq('tenant_id', tenantId)

const { data: leads } = await sb
  .from('crm_leads').select('conversation_id').eq('tenant_id', tenantId)

const comLead = new Set((leads ?? []).map(l => l.conversation_id))
const faltando = (convs ?? []).filter(c => !comLead.has(c.id))

console.log(`Tenant ${tenantId} · funil "${funil}" · etapa inicial "${etapaInicial}"`)
console.log(`Conversas: ${convs?.length ?? 0} · com lead: ${comLead.size} · sem lead: ${faltando.length}\n`)

if (faltando.length === 0) {
  console.log('Nada a fazer.')
  process.exit(0)
}

for (const c of faltando) {
  console.log(`  ${c.criado_em.slice(0, 16)}  ${c.contato_nome ?? '(sem nome)'}  ${c.contato_telefone}`)
}

if (!apply) {
  console.log('\nDry-run. Rode de novo com --apply para gravar.')
  process.exit(0)
}

// `criado_em`/`atualizado_em` recebem a data da conversa para o lead não
// aparecer como novo no funil — ele é histórico, não entrada de hoje.
const registros = faltando.map(c => ({
  tenant_id:        tenantId,
  conversation_id:  c.id,
  contato_nome:     c.contato_nome,
  contato_telefone: c.contato_telefone,
  funil_tipo:       funil,
  etapa:            etapaInicial,
  movido_por:       'agente',
  criado_em:        c.criado_em,
  atualizado_em:    c.criado_em,
}))

const { error } = await sb
  .from('crm_leads')
  .upsert(registros, { onConflict: 'conversation_id', ignoreDuplicates: true })

if (error) {
  console.error('\nFalhou:', error.message)
  process.exit(1)
}

console.log(`\n${registros.length} lead(s) criado(s).`)
