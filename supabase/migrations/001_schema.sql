-- ============================================================
-- HUBTEK SOLUTIONS — Schema inicial
-- Rodar no Supabase SQL Editor (dashboard.supabase.com)
-- ============================================================

-- 1. EXTENSÕES
-- ------------------------------------------------------------
create extension if not exists "pgvector";
create extension if not exists "uuid-ossp";


-- 2. TABELAS (ordem respeitando foreign keys)
-- ------------------------------------------------------------

create table if not exists tenants (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  slug              text unique not null,
  whatsapp_number   text,
  whatsapp_status   text default 'desconectado',
  -- 'conectado' | 'desconectado' | 'banido' | 'bloqueado'
  status            text default 'ativo',
  -- 'ativo' | 'inativo' | 'bloqueado'
  self_managed      boolean default false,
  acesso_expira_em  timestamptz,
  criado_em         timestamptz default now(),
  atualizado_em     timestamptz default now()
);

create table if not exists users (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid references tenants(id) on delete cascade,
  email       text not null,
  nome        text,
  role        text not null default 'operador',
  -- 'admin_hubtek' | 'admin_tenant' | 'operador' | 'self_managed'
  ativo       boolean default true,
  criado_em   timestamptz default now()
);

create table if not exists agent_config (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid unique references tenants(id) on delete cascade,
  prompt_principal      text,
  motor_ia_principal    text default 'openai',
  -- 'openai' | 'anthropic'
  motor_ia_backup       text default 'anthropic',
  ativo                 boolean default true,
  horario_inicio        time default '08:00',
  horario_fim           time default '23:00',
  dias_funcionamento    text[] default array['seg','ter','qua','qui','sex'],
  mensagem_ausencia     text default 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.',
  temperatura           numeric default 0.7,
  max_tokens            integer default 1000,
  atualizado_em         timestamptz default now()
);

create table if not exists knowledge_base (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade,
  nome_arquivo    text not null,
  tipo            text not null,
  -- 'pdf' | 'docx' | 'txt' | 'xlsx'
  conteudo_texto  text,
  embedding       vector(1536),
  tamanho_bytes   integer,
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);

create table if not exists conversations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references tenants(id) on delete cascade,
  contato_nome        text,
  contato_telefone    text not null,
  status              text default 'ativo',
  -- 'ativo' | 'pausado' | 'encerrado'
  agente_pausado      boolean default false,
  pausado_por         uuid references users(id),
  pausado_em          timestamptz,
  criado_em           timestamptz default now(),
  ultima_mensagem_em  timestamptz default now()
);

create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references conversations(id) on delete cascade,
  tenant_id        uuid references tenants(id) on delete cascade,
  origem           text not null,
  -- 'agente' | 'cliente'
  tipo             text default 'texto',
  -- 'texto' | 'audio' | 'imagem' | 'video' | 'documento'
  conteudo         text,
  arquivo_url      text,
  transcricao      text,
  metadata         jsonb,
  criado_em        timestamptz default now()
);

create table if not exists ai_usage (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid references tenants(id) on delete cascade,
  ciclo_mes               integer not null,
  ciclo_ano               integer not null,
  tokens_entrada          integer default 0,
  tokens_saida            integer default 0,
  custo_estimado_reais    numeric(10,4) default 0,
  motor_utilizado         text,
  conversation_id         uuid references conversations(id),
  criado_em               timestamptz default now()
);

create table if not exists billing_cycles (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,
  mes               integer not null,
  ano               integer not null,
  total_tokens      integer default 0,
  custo_total_reais numeric(10,4) default 0,
  total_conversas   integer default 0,
  total_mensagens   integer default 0,
  fechado           boolean default false,
  fechado_em        timestamptz,
  relatorio_url     text,
  criado_em         timestamptz default now(),
  unique(tenant_id, mes, ano)
);

create table if not exists appointments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,
  conversation_id   uuid references conversations(id),
  contato_nome      text,
  contato_telefone  text,
  data_hora         timestamptz not null,
  servico           text,
  status            text default 'agendado',
  -- 'agendado' | 'reagendado' | 'cancelado' | 'concluido'
  google_event_id   text,
  criado_em         timestamptz default now()
);


-- 3. ÍNDICES
-- ------------------------------------------------------------

-- Índice vetorial para busca semântica na knowledge_base
create index if not exists knowledge_base_embedding_idx
  on knowledge_base using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Índices por tenant_id (consultas filtradas por cliente)
create index if not exists idx_users_tenant_id          on users(tenant_id);
create index if not exists idx_agent_config_tenant_id   on agent_config(tenant_id);
create index if not exists idx_knowledge_base_tenant_id on knowledge_base(tenant_id);
create index if not exists idx_conversations_tenant_id  on conversations(tenant_id);
create index if not exists idx_messages_tenant_id       on messages(tenant_id);
create index if not exists idx_messages_conversation_id on messages(conversation_id);
create index if not exists idx_ai_usage_tenant_ciclo    on ai_usage(tenant_id, ciclo_ano, ciclo_mes);
create index if not exists idx_billing_cycles_tenant_id on billing_cycles(tenant_id);
create index if not exists idx_appointments_tenant_id   on appointments(tenant_id);


-- 4. ATIVAR RLS EM TODAS AS TABELAS
-- ------------------------------------------------------------

alter table tenants         enable row level security;
alter table users           enable row level security;
alter table agent_config    enable row level security;
alter table knowledge_base  enable row level security;
alter table conversations   enable row level security;
alter table messages        enable row level security;
alter table ai_usage        enable row level security;
alter table billing_cycles  enable row level security;
alter table appointments    enable row level security;


-- 5. FUNÇÕES HELPER (SECURITY DEFINER — contornam RLS para leitura interna)
-- ------------------------------------------------------------

create or replace function get_user_role()
returns text as $$
  select role from users where id = auth.uid()
$$ language sql security definer stable;

create or replace function get_user_tenant_id()
returns uuid as $$
  select tenant_id from users where id = auth.uid()
$$ language sql security definer stable;


-- 6. POLÍTICAS RLS
-- ------------------------------------------------------------

-- TENANTS
create policy "tenants_select" on tenants
  for select using (
    get_user_role() = 'admin_hubtek'
    or id = get_user_tenant_id()
  );

create policy "tenants_insert" on tenants
  for insert with check (
    get_user_role() = 'admin_hubtek'
  );

create policy "tenants_update" on tenants
  for update using (
    get_user_role() = 'admin_hubtek'
  );


-- USERS
create policy "users_select" on users
  for select using (
    auth.uid() = id
    or get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

create policy "users_insert" on users
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or auth.uid() = id
  );

create policy "users_update" on users
  for update using (
    auth.uid() = id
    or get_user_role() = 'admin_hubtek'
  );


-- AGENT_CONFIG
create policy "agent_config_select" on agent_config
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

create policy "agent_config_insert" on agent_config
  for insert with check (
    get_user_role() = 'admin_hubtek'
  );

create policy "agent_config_update" on agent_config
  for update using (
    get_user_role() = 'admin_hubtek'
    or (
      get_user_role() = 'self_managed'
      and tenant_id = get_user_tenant_id()
    )
  );


-- KNOWLEDGE_BASE
create policy "knowledge_base_select" on knowledge_base
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

create policy "knowledge_base_insert" on knowledge_base
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or get_user_role() = 'admin_tenant'
  );

create policy "knowledge_base_update" on knowledge_base
  for update using (
    get_user_role() = 'admin_hubtek'
    or (
      get_user_role() = 'admin_tenant'
      and tenant_id = get_user_tenant_id()
    )
  );


-- CONVERSATIONS
create policy "conversations_select" on conversations
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

create policy "conversations_insert" on conversations
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

create policy "conversations_update" on conversations
  for update using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );


-- MESSAGES
create policy "messages_select" on messages
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

create policy "messages_insert" on messages
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );


-- AI_USAGE — apenas admin_hubtek
create policy "ai_usage_select" on ai_usage
  for select using (
    get_user_role() = 'admin_hubtek'
  );

create policy "ai_usage_insert" on ai_usage
  for insert with check (
    get_user_role() = 'admin_hubtek'
  );


-- BILLING_CYCLES — apenas admin_hubtek
create policy "billing_cycles_select" on billing_cycles
  for select using (
    get_user_role() = 'admin_hubtek'
  );

create policy "billing_cycles_insert" on billing_cycles
  for insert with check (
    get_user_role() = 'admin_hubtek'
  );

create policy "billing_cycles_update" on billing_cycles
  for update using (
    get_user_role() = 'admin_hubtek'
  );


-- APPOINTMENTS
create policy "appointments_select" on appointments
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

create policy "appointments_insert" on appointments
  for insert with check (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

create policy "appointments_update" on appointments
  for update using (
    get_user_role() = 'admin_hubtek'
    or (
      tenant_id = get_user_tenant_id()
      and get_user_role() in ('admin_tenant', 'operador')
    )
  );


-- 7. FUNÇÃO RPC PARA BUSCA SEMÂNTICA
-- ------------------------------------------------------------

create or replace function match_knowledge(
  query_embedding   vector(1536),
  match_tenant_id   uuid,
  match_threshold   float,
  match_count       int
)
returns table (
  id              uuid,
  conteudo_texto  text,
  similarity      float
)
language sql stable as $$
  select
    id,
    conteudo_texto,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_base
  where tenant_id = match_tenant_id
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;


-- 8. TRIGGER: criar registro em users ao criar usuário no Auth
-- ------------------------------------------------------------
-- Nota: o trigger abaixo cria automaticamente o registro na tabela public.users
-- quando um novo usuário é criado via Supabase Auth.
-- O role padrão é 'operador' e tenant_id é null (definir após cadastro).

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'operador')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
