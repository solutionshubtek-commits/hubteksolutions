-- ============================================================================
-- 005 — Correção do RAG (índice vetorial) e da pausa do agente
-- ============================================================================
-- Origem: auditoria comparativa do tenant "Renovar Camas & Acessórios"
-- (28/07/2026) contra o tenant master. Ver diagnostico-renovar.md.
--
-- Esta migration é idempotente e não remove dado algum.
-- ----------------------------------------------------------------------------


-- 1. ÍNDICE VETORIAL — troca ivfflat por HNSW
-- ----------------------------------------------------------------------------
-- O índice criado em 001_schema.sql era `ivfflat (embedding vector_cosine_ops)
-- with (lists = 100)`, construído com a tabela VAZIA. O ivfflat particiona os
-- vetores em `lists` clusters no momento do build e, na consulta, visita apenas
-- `ivfflat.probes` clusters (padrão: 1). Com o índice treinado sobre zero
-- vetores e apenas 12 chunks inseridos depois, praticamente todo cluster
-- visitado vem vazio — `match_knowledge` retornava 0 linhas mesmo com
-- similaridade real de 0.63 e threshold de 0.35.
--
-- Sintoma no produto: o agente não encontrava o preço que ESTAVA na base e
-- alucinava os placeholders "[link]" e "[...verificando informações...]".
--
-- HNSW é um grafo incremental: não tem etapa de treino, então não degrada por
-- ter sido criado antes dos dados. Custa mais para construir e ocupa mais
-- espaço, o que é irrelevante na escala desta tabela.
drop index if exists knowledge_base_embedding_idx;

create index if not exists knowledge_base_embedding_idx
  on knowledge_base using hnsw (embedding vector_cosine_ops);


-- 2. match_knowledge — expõe criado_em
-- ----------------------------------------------------------------------------
-- process-message.ts ordena os chunks por `criado_em` (mais recente primeiro,
-- para resolver conflito entre versões do mesmo documento), mas a assinatura
-- de 001_schema.sql não retornava essa coluna — o campo chegava `undefined` no
-- código e aquela ordenação nunca surtiu efeito. Alinha a função ao consumidor.
--
-- O DROP é obrigatório: `create or replace function` não consegue alterar o
-- tipo de retorno de uma função existente (erro 42P13), e aqui estamos
-- acrescentando uma coluna ao retorno. A assinatura abaixo é a dos PARÂMETROS
-- de entrada, que não mudam.
drop function if exists match_knowledge(vector, uuid, double precision, integer);

create function match_knowledge(
  query_embedding   vector(1536),
  match_tenant_id   uuid,
  match_threshold   float,
  match_count       int
)
returns table (
  id              uuid,
  conteudo_texto  text,
  similarity      float,
  criado_em       timestamptz
)
language sql stable as $$
  select
    id,
    conteudo_texto,
    1 - (embedding <=> query_embedding) as similarity,
    criado_em
  from knowledge_base
  where tenant_id = match_tenant_id
    and embedding is not null
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- O DROP acima descarta junto qualquer permissão que a função tivesse. Sem
-- reconceder, /api/knowledge/search — que chama a RPC com a sessão do usuário,
-- e não com service role — passaria a receber "permission denied for function".
grant execute on function match_knowledge(vector, uuid, double precision, integer)
  to authenticated, service_role;


-- 3. Pausa automática com prazo de validade
-- ----------------------------------------------------------------------------
-- Quando um operador responde pelo WhatsApp Web, o agente passa a ser pausado
-- automaticamente (antes ele continuava respondendo por cima do atendente
-- humano). Essa pausa é temporária: `pausa_expira_em` marca quando o agente
-- volta sozinho.
--
-- NULL = pausa por tempo indeterminado — é o caso da pausa manual feita na
-- dashboard, que só sai por ação humana. Preserva o comportamento atual.
alter table conversations
  add column if not exists pausa_expira_em timestamptz;

comment on column conversations.pausa_expira_em is
  'Quando a pausa automática do agente expira e ele volta a responder sozinho. NULL = pausa manual, sem expiração.';


-- 4. Backfill: mensagens de operador sem tenant_id
-- ----------------------------------------------------------------------------
-- O ramo `fromMe` de /api/webhook/evolution inseria as falas do operador sem
-- preencher tenant_id. Como a policy `messages_select` exige
-- `tenant_id = get_user_tenant_id()`, o próprio dono do tenant não enxergava
-- as mensagens da sua equipe no histórico — só um admin_hubtek via.
update messages m
   set tenant_id = c.tenant_id
  from conversations c
 where m.conversation_id = c.id
   and m.tenant_id is null;

-- Impede que a origem do problema volte a passar despercebida: a partir daqui
-- toda mensagem precisa de tenant_id.
alter table messages
  alter column tenant_id set not null;
