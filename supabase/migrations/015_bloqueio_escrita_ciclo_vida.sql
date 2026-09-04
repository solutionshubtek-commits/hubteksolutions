-- ============================================================================
-- 015_bloqueio_escrita_ciclo_vida.sql
--
-- Faz o ciclo de vida do cliente valer TAMBÉM no banco.
--
-- PROBLEMA QUE ISSO RESOLVE
--   A 010 separou os dois eixos e o código passou a respeitá-los: o agente
--   parou de atender cliente vencido e o operador parou de entrar. Mas
--   "movimentar a ferramenta" continuou liberado — nenhuma rota de API e
--   nenhuma policy checava o plano. Um cliente com a assinatura vencida seguia
--   enviando mensagem no WhatsApp, movendo lead no CRM e criando agendamento.
--
--   O middleware passou a barrar as rotas de API (ver `bloqueioDeEscrita` em
--   middleware.ts), mas boa parte da dashboard escreve DIRETO no Supabase pelo
--   browser — configurações, pausa de conversa, CRM. Essas requisições não
--   passam pelo middleware: só a RLS as alcança.
--
--   Sem esta migration o bloqueio teria um furo do tamanho da metade da
--   dashboard, e o furo estaria justamente do lado do cliente final.
--
-- LEITURA CONTINUA LIBERADA, DE PROPÓSITO
--   Cliente vencido enxerga tudo — conversas, histórico, agendamentos, CRM.
--   Nenhum dado some, é isso que a tela promete a ele. O que trava é a escrita.
-- ============================================================================

-- ─── Predicado único, espelho de `podeOperar` no TypeScript ─────────────────
--
-- `security definer` porque a função consulta `tenants` de dentro da policy: o
-- usuário logado enxerga a própria linha, mas depender disso deixaria a regra
-- refém da policy de select. `stable` permite ao planner reaproveitar o
-- resultado dentro da mesma query, em vez de reavaliar linha a linha.
--
-- A conta de vencimento é a mesma das telas: só está vencido quem passou do
-- dia inteiro (`< current_date`), não quem vence hoje às 00:01.

create or replace function tenant_pode_operar(p_tenant_id uuid)
returns boolean as $$
  select coalesce(
    (
      select coalesce(t.status_comercial, 'ativo') = 'ativo'
         and (t.expira_em is null or t.expira_em::date >= current_date)
      from tenants t
      where t.id = p_tenant_id
    ),
    false
  )
$$ language sql security definer stable;

comment on function tenant_pode_operar(uuid) is
  'Espelho SQL de podeOperar() (lib/ciclo-vida.ts): plano em dia e cliente não cancelado/arquivado.';

-- As policies rodam no papel do usuário logado, então ele precisa poder
-- EXECUTAR o predicado — sem isto toda escrita passa a falhar por permissão,
-- não por vencimento. `service_role` também executa: o backend usa a mesma
-- função para conferir o estado antes de agir.
grant execute on function tenant_pode_operar(uuid) to authenticated, service_role;

-- ─── Policies de escrita ────────────────────────────────────────────────────
--
-- Cada uma repete a regra de acesso ORIGINAL e acrescenta o predicado do ciclo
-- de vida. `admin_hubtek` fica de fora do predicado em todas: é justamente a
-- Hubtek quem precisa mexer no cliente vencido para renovar e fechar o ciclo.

-- CONVERSATIONS — pausar/retomar agente, encerrar, reabrir
drop policy if exists "conversations_insert" on conversations;
create policy "conversations_insert" on conversations
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or (tenant_id = get_user_tenant_id() and tenant_pode_operar(tenant_id))
  );

drop policy if exists "conversations_update" on conversations;
create policy "conversations_update" on conversations
  for update using (
    get_user_role() = 'admin_hubtek'
    or (tenant_id = get_user_tenant_id() and tenant_pode_operar(tenant_id))
  );

-- MESSAGES — envio manual pela dashboard
drop policy if exists "messages_insert" on messages;
create policy "messages_insert" on messages
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or (tenant_id = get_user_tenant_id() and tenant_pode_operar(tenant_id))
  );

-- AGENT_CONFIG — prompt, horários, integrações
drop policy if exists "agent_config_update" on agent_config;
create policy "agent_config_update" on agent_config
  for update using (
    get_user_role() = 'admin_hubtek'
    or (
      get_user_role() = 'self_managed'
      and tenant_id = get_user_tenant_id()
      and tenant_pode_operar(tenant_id)
    )
  );

-- KNOWLEDGE_BASE — base de conhecimento do agente
drop policy if exists "knowledge_base_insert" on knowledge_base;
create policy "knowledge_base_insert" on knowledge_base
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or (get_user_role() = 'admin_tenant' and tenant_pode_operar(get_user_tenant_id()))
  );

drop policy if exists "knowledge_base_update" on knowledge_base;
create policy "knowledge_base_update" on knowledge_base
  for update using (
    get_user_role() = 'admin_hubtek'
    or (
      get_user_role() = 'admin_tenant'
      and tenant_id = get_user_tenant_id()
      and tenant_pode_operar(tenant_id)
    )
  );

-- APPOINTMENTS — agenda
drop policy if exists "appointments_insert" on appointments;
create policy "appointments_insert" on appointments
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or (tenant_id = get_user_tenant_id() and tenant_pode_operar(tenant_id))
  );

drop policy if exists "appointments_update" on appointments;
create policy "appointments_update" on appointments
  for update using (
    get_user_role() = 'admin_hubtek'
    or (
      tenant_id = get_user_tenant_id()
      and get_user_role() in ('admin_tenant', 'operador')
      and tenant_pode_operar(tenant_id)
    )
  );

-- ─── Nota sobre o que NÃO entra aqui ────────────────────────────────────────
--
-- `users` fica fora: o gestor precisa poder trocar a própria senha e o avatar
-- mesmo com o plano vencido — é conta pessoal, não movimentação da ferramenta.
-- `notifications` idem: marcar como lido o aviso de vencimento não pode
-- depender de estar em dia.
--
-- As tabelas escritas exclusivamente pelo backend com service role
-- (`ai_usage`, `billing_cycles`, `credito_*`, `crm_leads` via /api/crm) não
-- passam por RLS; nelas o gate do middleware é quem vale.


-- ─── Recarrega o schema exposto pela API ────────────────────────────────────
-- Função nova sem este notify continua invisível para o PostgREST, que segue
-- respondendo com o cache antigo. Custou um ciclo de ida e volta na 007.
notify pgrst, 'reload schema';
