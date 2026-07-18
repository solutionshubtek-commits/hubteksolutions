-- ============================================================
-- HUBTEK SOLUTIONS — 003: sincronizacao com o schema real
--
-- As migrations 001/002 ficaram defasadas: o banco evoluiu pelo SQL Editor
-- do dashboard e as alteracoes nunca voltaram para o repositorio. Este
-- arquivo reconcilia o repo com o que existe hoje em producao, para que uma
-- instalacao do zero chegue ao mesmo estado.
--
-- Gerado a partir da introspecao do banco (OpenAPI do PostgREST) em 18/07/2026.
-- Idempotente: pode ser rodado mais de uma vez com seguranca.
--
-- LIMITES DA INTROSPECAO — nao sao recuperaveis por esta via e podem precisar
-- de ajuste manual:
--   * constraints CHECK e UNIQUE compostas
--   * o ON DELETE real das foreign keys. tenant_id usa CASCADE (convencao da
--     001); as demais ficaram em NO ACTION para nao arriscar perda de dados
--   * indices, politicas de RLS, triggers e functions
-- ============================================================


-- 1. TABELAS AUSENTES NO REPOSITORIO
-- ------------------------------------------------------------

create table if not exists ciclos_fechados (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid references tenants(id) on delete cascade,
  tenant_nome                  text,
  mes_ref                      text,
  conversas                    integer default 0,
  tokens                       bigint default 0,
  custo_usd                    numeric default 0,
  custo_brl                    numeric default 0,
  valor_cobrado                numeric default 0,
  fechado_em                   timestamptz default now(),
  fechado_por                  uuid
);

create table if not exists contact_profiles (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references tenants(id) on delete cascade,
  contato_telefone             text not null,
  contato_nome                 text,
  cidade                       text,
  preferencias                 jsonb,
  historico_resumido           text,
  ultima_atualizacao           timestamptz default now(),
  criado_em                    timestamptz default now()
);

create table if not exists conversation_logs (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references tenants(id) on delete cascade,
  conversation_id              uuid references conversations(id),
  user_id                      uuid references users(id),
  acao                         text not null,
  descricao                    text,
  contato_nome                 text,
  criado_em                    timestamptz default now() not null
);

create table if not exists conversation_logs_arquivo (
  id                           uuid primary key,
  tenant_id                    uuid references tenants(id) on delete cascade,
  conversation_id              uuid,
  user_id                      uuid,
  acao                         text,
  descricao                    text,
  contato_nome                 text,
  criado_em                    timestamptz,
  arquivado_em                 timestamptz default now()
);

create table if not exists conversations_arquivo (
  id                           uuid primary key,
  tenant_id                    uuid references tenants(id) on delete cascade,
  contato_nome                 text,
  contato_telefone             text,
  status                       text,
  agente_pausado               boolean,
  pausado_por                  uuid,
  pausado_em                   timestamptz,
  criado_em                    timestamptz,
  ultima_mensagem_em           timestamptz,
  instance_name                text,
  arquivado_em                 timestamptz default now()
);

create table if not exists crm_leads (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references tenants(id) on delete cascade,
  conversation_id              uuid not null references conversations(id),
  contato_nome                 text,
  contato_telefone             text not null,
  funil_tipo                   text not null,
  etapa                        text not null,
  etapa_anterior               text,
  movido_por                   text default 'agente' not null,
  resumo                       text,
  criado_em                    timestamptz default now(),
  atualizado_em                timestamptz default now()
);

create table if not exists notifications (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid references tenants(id) on delete cascade,
  user_id                      uuid,
  tipo                         text not null,
  titulo                       text not null,
  mensagem                     text not null,
  lida                         boolean default false,
  criado_em                    timestamptz default now(),
  metadata                     jsonb
);

create table if not exists plan_upgrades (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid references tenants(id) on delete cascade,
  plano_anterior               text not null,
  plano_novo                   text not null,
  conversas_no_momento         integer,
  motivo                       text,
  criado_em                    timestamptz default now()
);

create table if not exists profissionais (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references tenants(id) on delete cascade,
  nome                         text not null,
  especialidade                text,
  ativo                        boolean default true,
  criado_em                    timestamptz default now()
);

create table if not exists scheduled_tasks (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references tenants(id) on delete cascade,
  instance_name                text not null,
  contato_telefone             text not null,
  contato_nome                 text not null,
  tipo                         text not null,
  mensagem_inicial             text not null,
  variaveis                    jsonb,
  status                       text default 'pendente' not null,
  agendado_para                timestamptz not null,
  appointment_id               uuid references appointments(id),
  conversation_id              uuid references conversations(id),
  enviado_em                   timestamptz,
  erro                         text,
  criado_por                   uuid references users(id),
  criado_em                    timestamptz default now() not null
);

create table if not exists tenant_instances (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references tenants(id) on delete cascade,
  instance_name                text not null,
  instance_token               text,
  apelido                      text default 'Principal' not null,
  status                       text default 'desconectado' not null,
  criado_em                    timestamptz default now(),
  status_reason                integer
);

create table if not exists token_usage (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid references tenants(id) on delete cascade,
  conversation_id              uuid references conversations(id),
  modelo                       text,
  tokens_entrada               integer default 0,
  tokens_saida                 integer default 0,
  tokens_total                 integer default 0,
  custo_usd                    numeric default 0,
  criado_em                    timestamptz default now()
);


-- 2. COLUNAS ADICIONADAS EM TABELAS JA EXISTENTES
-- ------------------------------------------------------------

-- agent_config
alter table agent_config add column if not exists google_calendar_config jsonb;
alter table agent_config add column if not exists funcoes_ativas text[];

-- appointments
alter table appointments add column if not exists instance_name text;
alter table appointments add column if not exists lembrete_enviado boolean default false;
alter table appointments add column if not exists antecedencia_horas integer default 24;
alter table appointments add column if not exists criado_por uuid references users(id);
alter table appointments add column if not exists profissional text;

-- conversations
alter table conversations add column if not exists instance_name text;
alter table conversations add column if not exists atendente_id uuid references users(id);
alter table conversations add column if not exists atendente_nome text;
alter table conversations add column if not exists transferencia_pendente jsonb;
alter table conversations add column if not exists transferencia_tentativas integer default 0;

-- messages
alter table messages add column if not exists from_me boolean default false;
alter table messages add column if not exists sent_by_user_id uuid references users(id);

-- tenants
alter table tenants add column if not exists prompt_agente text;
alter table tenants add column if not exists horario_inicio time default '08:00:00';
alter table tenants add column if not exists horario_fim time default '18:00:00';
alter table tenants add column if not exists mensagem_fora_horario text;
alter table tenants add column if not exists horario_funcionamento jsonb;
alter table tenants add column if not exists expira_em timestamptz;
alter table tenants add column if not exists agente_ativo boolean default true;
alter table tenants add column if not exists agente_pausado_em timestamptz;
alter table tenants add column if not exists pausado_por_admin boolean default false;
alter table tenants add column if not exists plano text default 'essencial';
alter table tenants add column if not exists instance_name text;
alter table tenants add column if not exists instance_token text;
alter table tenants add column if not exists google_calendar_config jsonb;
alter table tenants add column if not exists avatar_url text;
alter table tenants add column if not exists lembrete_antecedencia_horas integer default 24;

-- users
alter table users add column if not exists avatar_url text;
alter table users add column if not exists senha_provisoria boolean default false;
alter table users add column if not exists ultimo_heartbeat timestamptz;
alter table users add column if not exists status_atendimento text default 'disponivel';


-- 3. INDICES POR TENANT NAS TABELAS NOVAS
-- ------------------------------------------------------------
create index if not exists idx_ciclos_fechados_tenant_id on ciclos_fechados(tenant_id);
create index if not exists idx_contact_profiles_tenant_id on contact_profiles(tenant_id);
create index if not exists idx_conversation_logs_tenant_id on conversation_logs(tenant_id);
create index if not exists idx_conversation_logs_arquivo_tenant_id on conversation_logs_arquivo(tenant_id);
create index if not exists idx_conversations_arquivo_tenant_id on conversations_arquivo(tenant_id);
create index if not exists idx_crm_leads_tenant_id on crm_leads(tenant_id);
create index if not exists idx_notifications_tenant_id on notifications(tenant_id);
create index if not exists idx_plan_upgrades_tenant_id on plan_upgrades(tenant_id);
create index if not exists idx_profissionais_tenant_id on profissionais(tenant_id);
create index if not exists idx_scheduled_tasks_tenant_id on scheduled_tasks(tenant_id);
create index if not exists idx_tenant_instances_tenant_id on tenant_instances(tenant_id);
create index if not exists idx_token_usage_tenant_id on token_usage(tenant_id);


-- 4. PENDENCIAS QUE ESTE ARQUIVO NAO COBRE
-- ------------------------------------------------------------
-- Existem no banco mas nao sao recuperaveis por introspecao. Precisam ser
-- extraidas do dashboard (SQL Editor) e versionadas em uma migration 004:
--
--   VIEW conversas_aguardando_humano
--     Derivada de conversations. Nao foi recriada aqui porque o CREATE TABLE
--     equivalente produziria uma tabela vazia no lugar da view.
--
--   FUNCTION arquivar_logs_antigos()       -- usada por /api/cron/arquivar-logs
--   FUNCTION arquivar_conversas_antigas()  -- usada por /api/cron/arquivar-conversas
--   FUNCTION rls_auto_enable()
--
--   Politicas de RLS das 12 tabelas criadas acima. A secao 4 da 001 ativa RLS
--   apenas nas tabelas originais; as novas precisam do mesmo tratamento.
