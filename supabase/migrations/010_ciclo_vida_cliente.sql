-- ============================================================================
-- 010_ciclo_vida_cliente.sql
--
-- Separa os DOIS eixos de estado de um cliente, que hoje estão colapsados na
-- única coluna `tenants.status`.
--
-- EIXO 1 — ciclo de vida COMERCIAL, manual: ativo → cancelado → arquivado
--   (→ expurgo físico, fora do banco). Decisão deliberada do admin_hubtek.
--
-- EIXO 2 — estado OPERACIONAL por expiração de plano, automático e reversível.
--   Continua morando em `expira_em` + campos de pausa do agente.
--
-- PROBLEMA QUE ISSO RESOLVE
--   `status = 'bloqueado'` era, na prática, decorativo: trocava o badge da
--   lista de clientes e tirava o cliente do KPI "Clientes ativos", mas o
--   middleware não lia esse campo e `isTenantAgentActive()` também não. O
--   agente seguia atendendo e o cliente seguia entrando na dashboard. Era a
--   origem do "cliente aparece Ativo mesmo bloqueado" — ele estava mesmo.
--
-- POR QUE UMA COLUNA NOVA, E NÃO NOVOS VALORES EM `status`
--   `status` é lido em 6 pontos que só conhecem 'ativo'|'inativo'|'bloqueado'
--   (statusConfig cai no fallback "Inativo", os filtros da visão geral param de
--   casar). Escrever 'cancelado'/'arquivado' ali quebraria essas telas em
--   silêncio. `status` continua existindo e continua sendo escrito em espelho
--   pelas rotas do Eixo 1 — nada que lê hoje precisa mudar de uma vez.
-- ============================================================================

-- ─── EIXO 1: estado comercial ───────────────────────────────────────────────

alter table tenants add column if not exists status_comercial  text default 'ativo';
alter table tenants add column if not exists cancelado_em      timestamptz;
alter table tenants add column if not exists arquivado_em      timestamptz;
alter table tenants add column if not exists arquivado_por     uuid references users(id);
alter table tenants add column if not exists motivo            text;

-- Contas de teste/demo podem ser expurgadas sem esperar a retenção legal,
-- porque não têm valor fiscal nem de auditoria.
alter table tenants add column if not exists conta_demo        boolean default false;

-- Backfill: quem estava 'bloqueado' era, na intenção, um cancelamento
-- comercial. O `status` original fica intacto.
update tenants set status_comercial = 'cancelado'
  where status = 'bloqueado' and status_comercial is distinct from 'cancelado';

update tenants set status_comercial = 'ativo'
  where status_comercial is null;

alter table tenants
  drop constraint if exists tenants_status_comercial_check;
alter table tenants
  add constraint tenants_status_comercial_check
  check (status_comercial in ('ativo', 'cancelado', 'arquivado'));

-- ─── EIXO 2: estado operacional por expiração ───────────────────────────────

-- Carimbo de quando o cron constatou o vencimento. Serve de marca de
-- idempotência: enquanto estiver preenchido, o cron não reprocessa o tenant.
alter table tenants add column if not exists expirado_em         timestamptz;

-- Distingue "o agente está desligado porque o plano venceu" de "o agente está
-- desligado porque alguém decidiu desligar". Sem isso, a renovação religaria
-- por cima de uma pausa manual anterior, que não tem nada a ver com pagamento.
alter table tenants add column if not exists pausa_por_expiracao boolean default false;

-- ─── Log de ações administrativas ───────────────────────────────────────────
-- Não existia nada: bloqueio, mudança de plano e alteração de expiração não
-- deixavam rastro. `tenant_id` é ON DELETE SET NULL (não cascade) de propósito
-- — o registro do expurgo tem que sobreviver ao expurgo. Por isso `tenant_nome`
-- é denormalizado, como já se faz em `ciclos_fechados`.

create table if not exists admin_logs (
  id             uuid primary key default gen_random_uuid(),
  admin_user_id  uuid references users(id) on delete set null,
  tenant_id      uuid references tenants(id) on delete set null,
  tenant_nome    text,
  acao           text not null,
  de             text,
  para           text,
  motivo         text,
  detalhes       jsonb,
  automatico     boolean default false,
  criado_em      timestamptz default now() not null
);

create index if not exists idx_admin_logs_tenant on admin_logs (tenant_id, criado_em desc);
create index if not exists idx_admin_logs_criado on admin_logs (criado_em desc);

grant select, insert, update, delete on admin_logs to authenticated;

alter table admin_logs enable row level security;

drop policy if exists "admin_logs_select" on admin_logs;
create policy "admin_logs_select" on admin_logs
  for select using (get_user_role() = 'admin_hubtek');

drop policy if exists "admin_logs_write" on admin_logs;
create policy "admin_logs_write" on admin_logs
  for all using (get_user_role() = 'admin_hubtek')
  with check (get_user_role() = 'admin_hubtek');

-- ─── Índices de apoio ───────────────────────────────────────────────────────
-- O cron de expiração varre por (expira_em vencido, expirado_em nulo) todo dia;
-- as telas admin passam a filtrar por status_comercial.

create index if not exists idx_tenants_status_comercial on tenants (status_comercial);
create index if not exists idx_tenants_expiracao        on tenants (expira_em)
  where expirado_em is null;

notify pgrst, 'reload schema';
