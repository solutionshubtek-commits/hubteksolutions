# SKILL: Supabase — Hubtek Solutions

## Propósito
Padrões obrigatórios para toda interação com o Supabase neste projeto. Leia antes de criar tabelas, queries, policies ou autenticação.

---

## 1. ESTRUTURA DO PROJETO SUPABASE

```
Projeto: hubtek-solutions (email: solutionshubtek@gmail.com)
Região: South America (sa-east-1)
Extensões obrigatórias: pgvector, uuid-ossp
```

---

## 2. SCHEMA COMPLETO DAS TABELAS

### tenants
```sql
create table tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique not null,
  whatsapp_number text,
  whatsapp_status text default 'desconectado',
  -- 'conectado' | 'desconectado' | 'banido' | 'bloqueado'
  status text default 'ativo',
  -- 'ativo' | 'inativo' | 'bloqueado'
  self_managed boolean default false,
  acesso_expira_em timestamptz,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
```

### users
```sql
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  email text not null,
  nome text,
  role text not null default 'operador',
  -- 'admin_hubtek' | 'admin_tenant' | 'operador' | 'self_managed'
  ativo boolean default true,
  criado_em timestamptz default now()
);
```

### agent_config
```sql
create table agent_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid unique references tenants(id) on delete cascade,
  prompt_principal text,
  motor_ia_principal text default 'openai',
  -- 'openai' | 'anthropic'
  motor_ia_backup text default 'anthropic',
  ativo boolean default true,
  horario_inicio time default '08:00',
  horario_fim time default '23:00',
  dias_funcionamento text[] default array['seg','ter','qua','qui','sex'],
  mensagem_ausencia text default 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.',
  temperatura numeric default 0.7,
  max_tokens integer default 1000,
  atualizado_em timestamptz default now()
);
```

### knowledge_base
```sql
create table knowledge_base (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  nome_arquivo text not null,
  tipo text not null,
  -- 'pdf' | 'docx' | 'txt' | 'xlsx'
  conteudo_texto text,
  embedding vector(1536),
  tamanho_bytes integer,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- Index obrigatório para busca vetorial
create index on knowledge_base 
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
```

### conversations
```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  contato_nome text,
  contato_telefone text not null,
  status text default 'ativo',
  -- 'ativo' | 'pausado' | 'encerrado'
  agente_pausado boolean default false,
  pausado_por uuid references users(id),
  pausado_em timestamptz,
  criado_em timestamptz default now(),
  ultima_mensagem_em timestamptz default now()
);
```

### messages
```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  origem text not null,
  -- 'agente' | 'cliente'
  tipo text default 'texto',
  -- 'texto' | 'audio' | 'imagem' | 'video' | 'documento'
  conteudo text,
  arquivo_url text,
  transcricao text,
  -- para áudios transcritos via Whisper
  metadata jsonb,
  criado_em timestamptz default now()
);
```

### ai_usage
```sql
create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  ciclo_mes integer not null,
  ciclo_ano integer not null,
  tokens_entrada integer default 0,
  tokens_saida integer default 0,
  custo_estimado_reais numeric(10,4) default 0,
  motor_utilizado text,
  conversation_id uuid references conversations(id),
  criado_em timestamptz default now()
);

-- Index para consultas por ciclo
create index on ai_usage(tenant_id, ciclo_ano, ciclo_mes);
```

### billing_cycles
```sql
create table billing_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  mes integer not null,
  ano integer not null,
  total_tokens integer default 0,
  custo_total_reais numeric(10,4) default 0,
  total_conversas integer default 0,
  total_mensagens integer default 0,
  fechado boolean default false,
  fechado_em timestamptz,
  relatorio_url text,
  criado_em timestamptz default now(),
  unique(tenant_id, mes, ano)
);
```

### appointments
```sql
create table appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  conversation_id uuid references conversations(id),
  contato_nome text,
  contato_telefone text,
  data_hora timestamptz not null,
  servico text,
  status text default 'agendado',
  -- 'agendado' | 'reagendado' | 'cancelado' | 'concluido'
  google_event_id text,
  criado_em timestamptz default now()
);
```

---

## 3. ROW LEVEL SECURITY (RLS)

Ativar RLS em todas as tabelas. Nenhuma exceção.

```sql
-- Ativar RLS em todas as tabelas
alter table tenants enable row level security;
alter table users enable row level security;
alter table agent_config enable row level security;
alter table knowledge_base enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table ai_usage enable row level security;
alter table billing_cycles enable row level security;
alter table appointments enable row level security;
```

### Policies padrão por role

```sql
-- HELPER: função para pegar o role do usuário logado
create or replace function get_user_role()
returns text as $$
  select role from users where id = auth.uid()
$$ language sql security definer;

-- HELPER: função para pegar o tenant_id do usuário logado
create or replace function get_user_tenant_id()
returns uuid as $$
  select tenant_id from users where id = auth.uid()
$$ language sql security definer;

-- Exemplo de policy para conversations
-- admin_hubtek vê tudo
-- admin_tenant e operador veem apenas o próprio tenant
-- self_managed vê apenas o próprio tenant
create policy "conversations_select" on conversations
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

-- Apenas admin_hubtek pode ver ai_usage e billing_cycles
create policy "ai_usage_admin_only" on ai_usage
  for select using (
    get_user_role() = 'admin_hubtek'
  );

create policy "billing_cycles_admin_only" on billing_cycles
  for select using (
    get_user_role() = 'admin_hubtek'
  );

-- self_managed pode editar agent_config apenas do próprio tenant
create policy "agent_config_self_managed" on agent_config
  for update using (
    get_user_role() = 'admin_hubtek'
    or (
      get_user_role() = 'self_managed'
      and tenant_id = get_user_tenant_id()
    )
  );
```

---

## 4. AUTENTICAÇÃO

```typescript
// Sempre usar Supabase Auth — nunca JWT manual
import { createClient } from '@supabase/supabase-js'

// Cliente server-side (API Routes do Next.js)
import { createServerClient } from '@supabase/ssr'

// Cliente browser (componentes React)
import { createBrowserClient } from '@supabase/ssr'
```

### Padrão de verificação de sessão em API Route
```typescript
export async function GET(request: Request) {
  const supabase = createServerClient(...)
  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: user } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', session.user.id)
    .single()

  // Verificar permissão antes de qualquer operação
  if (user.role !== 'admin_hubtek') {
    return Response.json({ error: 'Sem permissão' }, { status: 403 })
  }
}
```

---

## 5. PADRÕES DE QUERY

```typescript
// ✅ CORRETO — sempre tratar erro
const { data, error } = await supabase
  .from('conversations')
  .select('*, messages(count)')
  .eq('tenant_id', tenantId)
  .eq('status', 'ativo')
  .order('ultima_mensagem_em', { ascending: false })

if (error) {
  console.error('Erro ao buscar conversas:', error)
  throw new Error(error.message)
}

// ✅ Busca vetorial na base de conhecimento
const { data: docs } = await supabase.rpc('match_knowledge', {
  query_embedding: embedding,
  match_tenant_id: tenantId,
  match_threshold: 0.7,
  match_count: 5
})
```

### Função RPC para busca semântica
```sql
create or replace function match_knowledge(
  query_embedding vector(1536),
  match_tenant_id uuid,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  conteudo_texto text,
  similarity float
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
```

---

## 6. REGRAS GERAIS

```
✅ Sempre usar RLS — nunca service_role no client-side
✅ Sempre tratar o campo error em todas as queries
✅ Sempre filtrar por tenant_id em todas as queries
✅ Nunca expor SUPABASE_SERVICE_ROLE_KEY no frontend
✅ Usar transações para operações que afetam múltiplas tabelas
✅ Índices obrigatórios em tenant_id de todas as tabelas
❌ Nunca usar .single() sem tratar o caso de retorno nulo
❌ Nunca fazer select * em tabelas grandes — especificar colunas
❌ Nunca deletar registros — usar soft delete com campo ativo=false
```
