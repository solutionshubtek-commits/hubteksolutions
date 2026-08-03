import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { exigirAdminHubtek } from '@/lib/auth/admin'
import { RETENCAO_ANOS, elegivelParaExpurgoEm, statusComercialDe } from '@/lib/ciclo-vida'

/**
 * EIXO 1, último passo — EXPURGO FÍSICO. Única rota do sistema que apaga um
 * cliente de verdade.
 *
 *   GET  ?tenant_id=…  → simulação: o que seria apagado, sem apagar nada.
 *   POST               → executa, com dupla confirmação.
 *
 * Elegibilidade (uma das duas):
 *   (a) arquivado há mais de RETENCAO_ANOS (5 anos — exigência fiscal), ou
 *   (b) marcado como conta de teste/demo (`conta_demo`), que não tem valor de
 *       auditoria.
 *
 * O que a cascata do banco resolve sozinha: as 20 tabelas com FK
 * `tenant_id … on delete cascade`. O que ela NÃO resolve, e por isso é feito
 * aqui, na ordem:
 *   1. instâncias na Evolution API (fora do banco);
 *   2. arquivos nos buckets de Storage (fora do banco);
 *   3. contas em `auth.users` — `public.users` referencia `auth.users`, não o
 *      contrário, então apagar o tenant deixaria os logins órfãos e ainda
 *      válidos;
 *   4. FKs NO ACTION que apontam para `users(id)` de fora do tenant
 *      (`custos_operacionais.atualizado_por`, `tenants.arquivado_por`) — sem
 *      zerar essas referências, o DELETE do tenant é recusado pelo banco.
 */

function servico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Tabelas com FK direta para tenants. Usadas só para CONTAR na simulação — o
// DELETE em si é feito pela cascata do banco, que é quem garante a ordem certa.
const TABELAS_TENANT = [
  'users', 'agent_config', 'knowledge_base', 'conversations', 'messages',
  'ai_usage', 'billing_cycles', 'appointments', 'ciclos_fechados',
  'contact_profiles', 'conversation_logs', 'conversation_logs_arquivo',
  'conversations_arquivo', 'crm_leads', 'notifications', 'plan_upgrades',
  'profissionais', 'scheduled_tasks', 'tenant_instances', 'token_usage',
] as const

interface Elegibilidade {
  elegivel: boolean
  motivo: string
  liberado_em: string | null
}

function avaliarElegibilidade(tenant: {
  status_comercial: string | null
  arquivado_em: string | null
  conta_demo: boolean | null
}): Elegibilidade {
  if (tenant.conta_demo) {
    return { elegivel: true, motivo: 'Conta de teste/demo — sem valor de auditoria.', liberado_em: null }
  }

  if (statusComercialDe(tenant.status_comercial) !== 'arquivado') {
    return {
      elegivel: false,
      motivo: 'O cliente precisa estar ARQUIVADO antes de ser expurgado.',
      liberado_em: null,
    }
  }

  if (!tenant.arquivado_em) {
    return {
      elegivel: false,
      motivo: 'Cliente arquivado sem data de arquivamento — não dá para apurar a retenção.',
      liberado_em: null,
    }
  }

  const liberadoEm = elegivelParaExpurgoEm(tenant.arquivado_em)
  if (liberadoEm.getTime() > Date.now()) {
    return {
      elegivel: false,
      motivo: `Retenção legal de ${RETENCAO_ANOS} anos em curso. Elegível a partir de ${liberadoEm.toLocaleDateString('pt-BR')}.`,
      liberado_em: liberadoEm.toISOString(),
    }
  }

  return {
    elegivel: true,
    motivo: `Retenção de ${RETENCAO_ANOS} anos cumprida.`,
    liberado_em: liberadoEm.toISOString(),
  }
}

async function contarLinhas(supabase: SupabaseClient, tenantId: string) {
  const contagens: Record<string, number> = {}
  let total = 0

  await Promise.all(
    TABELAS_TENANT.map(async (tabela) => {
      const { count, error } = await supabase
        .from(tabela)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      if (error) return
      contagens[tabela] = count ?? 0
      total += count ?? 0
    })
  )

  return { contagens, total }
}

async function listarArquivos(supabase: SupabaseClient, tenantId: string) {
  const alvos: { bucket: string; caminhos: string[] }[] = []

  for (const bucket of ['knowledge-base', 'mensagens-midia']) {
    const { data: lista } = await supabase.storage.from(bucket).list(tenantId)
    const caminhos = (lista ?? []).map(f => `${tenantId}/${f.name}`)
    if (caminhos.length) alvos.push({ bucket, caminhos })
  }

  // Avatares não ficam sob a pasta do tenant — vivem em `avatars/{id}.{ext}`.
  const { data: avatares } = await supabase.storage.from('mensagens-midia').list('avatars')
  const doTenant = (avatares ?? [])
    .filter(f => f.name.startsWith(`${tenantId}.`))
    .map(f => `avatars/${f.name}`)
  if (doTenant.length) alvos.push({ bucket: 'mensagens-midia', caminhos: doTenant })

  return alvos
}

async function carregarAlvo(supabase: SupabaseClient, tenantId: string) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, nome, slug, status, status_comercial, arquivado_em, conta_demo, criado_em')
    .eq('id', tenantId)
    .single()

  if (!tenant) return null

  const [{ contagens, total }, arquivos, instanciasRes, usuariosRes] = await Promise.all([
    contarLinhas(supabase, tenantId),
    listarArquivos(supabase, tenantId),
    supabase.from('tenant_instances').select('instance_name').eq('tenant_id', tenantId),
    supabase.from('users').select('id, email').eq('tenant_id', tenantId),
  ])

  return {
    tenant,
    elegibilidade: avaliarElegibilidade(tenant),
    contagens,
    total_linhas: total,
    instancias: (instanciasRes.data ?? []).map(i => i.instance_name),
    contas_login: (usuariosRes.data ?? []).map(u => ({ id: u.id, email: u.email })),
    arquivos: arquivos.map(a => ({ bucket: a.bucket, total: a.caminhos.length })),
    arquivos_caminhos: arquivos,
  }
}

/** Simulação — não apaga nada. É o que a tela mostra antes da confirmação. */
export async function GET(request: Request) {
  const guarda = await exigirAdminHubtek()
  if (guarda.erro) return guarda.erro

  const tenantId = new URL(request.url).searchParams.get('tenant_id')
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id obrigatório.' }, { status: 400 })
  }

  const alvo = await carregarAlvo(servico(), tenantId)
  if (!alvo) {
    return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  // `arquivos_caminhos` fica de fora da resposta: a tela precisa do total por
  // bucket, não da lista de caminhos internos do Storage.
  const resumo = { ...alvo, arquivos_caminhos: undefined }
  return NextResponse.json({ simulacao: true, ...resumo })
}

export async function POST(request: Request) {
  try {
    const guarda = await exigirAdminHubtek()
    if (guarda.erro) return guarda.erro

    const body = await request.json().catch(() => ({}))
    const tenantId: string | undefined = body.tenant_id
    const confirmacaoSlug: string = typeof body.confirmacao_slug === 'string' ? body.confirmacao_slug.trim() : ''

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id obrigatório.' }, { status: 400 })
    }

    // Dupla confirmação: a flag explícita E o slug digitado à mão. O slug é o
    // que impede o acidente de expurgar o cliente errado — um clique a mais
    // sozinho não protege de nada.
    if (body.confirmar !== true) {
      return NextResponse.json({ error: 'Confirmação ausente.' }, { status: 400 })
    }

    const supabase = servico()
    const alvo = await carregarAlvo(supabase, tenantId)
    if (!alvo) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    }

    if (confirmacaoSlug !== alvo.tenant.slug) {
      return NextResponse.json(
        { error: `Confirmação inválida. Digite exatamente o slug do cliente: ${alvo.tenant.slug}` },
        { status: 400 }
      )
    }

    if (!alvo.elegibilidade.elegivel) {
      return NextResponse.json({ error: alvo.elegibilidade.motivo }, { status: 409 })
    }

    const { tenant, contagens, total_linhas, instancias, contas_login, arquivos_caminhos } = alvo
    const falhas: string[] = []

    // ── 1. Instâncias na Evolution API ───────────────────────────────────────
    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

    for (const instanceName of instancias) {
      if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
        falhas.push(`Evolution não configurada — instância ${instanceName} não removida.`)
        continue
      }
      try {
        const res = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: EVOLUTION_API_KEY },
        })
        // 404 = já não existia lá. Mesmo tratamento de /api/admin/deletar-instancia.
        if (!res.ok && res.status !== 404) {
          falhas.push(`Evolution respondeu ${res.status} para ${instanceName}.`)
        }
      } catch {
        falhas.push(`Falha de rede ao remover a instância ${instanceName}.`)
      }
    }

    // ── 2. Storage ───────────────────────────────────────────────────────────
    for (const { bucket, caminhos } of arquivos_caminhos) {
      const { error } = await supabase.storage.from(bucket).remove(caminhos)
      if (error) falhas.push(`Storage ${bucket}: ${error.message}`)
    }

    // ── 3. Referências NO ACTION para users() de fora da cascata ─────────────
    // Sem isto o DELETE do tenant é recusado pelo banco: essas FKs não têm
    // ON DELETE, então o Postgres bloqueia a remoção do usuário referenciado.
    const idsUsuarios = contas_login.map(c => c.id)
    if (idsUsuarios.length > 0) {
      await supabase.from('custos_operacionais').update({ atualizado_por: null }).in('atualizado_por', idsUsuarios)
      await supabase.from('tenants').update({ arquivado_por: null }).in('arquivado_por', idsUsuarios)
    }

    // ── 4. Log ANTES do delete ───────────────────────────────────────────────
    // `admin_logs.tenant_id` é ON DELETE SET NULL de propósito, mas o registro
    // precisa existir antes: se a linha do tenant sumir primeiro e o insert
    // falhar depois, o expurgo fica sem rastro nenhum.
    await supabase.from('admin_logs').insert({
      admin_user_id: guarda.userId,
      tenant_id: tenantId,
      tenant_nome: tenant.nome,
      acao: 'expurgo',
      de: statusComercialDe(tenant.status_comercial),
      para: 'expurgado',
      motivo: alvo.elegibilidade.motivo,
      detalhes: {
        slug: tenant.slug,
        conta_demo: tenant.conta_demo,
        arquivado_em: tenant.arquivado_em,
        total_linhas,
        contagens,
        instancias,
        contas_login: contas_login.map(c => c.email),
      },
    })

    // ── 5. Contas de login ───────────────────────────────────────────────────
    for (const conta of contas_login) {
      const { error } = await supabase.auth.admin.deleteUser(conta.id)
      if (error) falhas.push(`auth.users ${conta.email}: ${error.message}`)
    }

    // ── 6. O tenant, que dispara a cascata em todas as tabelas ───────────────
    const { error: erroDelete } = await supabase.from('tenants').delete().eq('id', tenantId)
    if (erroDelete) {
      return NextResponse.json(
        { error: `Falha ao expurgar: ${erroDelete.message}`, falhas },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      expurgado: { nome: tenant.nome, slug: tenant.slug },
      total_linhas,
      contagens,
      instancias_removidas: instancias.length,
      contas_removidas: contas_login.length,
      // Falhas fora do banco não impedem o expurgo, mas precisam aparecer:
      // uma instância órfã na Evolution continua consumindo recurso.
      falhas,
    })
  } catch (err) {
    console.error('[expurgar-cliente] falhou:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      { status: 500 }
    )
  }
}
