-- ============================================================================
-- 007_custos_operacionais.sql
--
-- Persiste os custos fixos operacionais da tela admin/custos-ia.
--
-- PROBLEMA: o botão "Salvar" do modal de custos fixos só fechava o modal
-- (setShowCustosModal(false)). Não existia gravação nenhuma — os valores viviam
-- em estado React inicializado a partir de uma constante no código, então
-- qualquer F5 restaurava os defaults. Não era uma falha ao salvar; a gravação
-- nunca foi implementada.
--
-- MODELO: uma linha por (competência, chave). A competência é o primeiro dia do
-- mês, porque os créditos de IA variam mês a mês — é justamente o histórico de
-- quanto foi recarregado nas engines em cada período. Custos recorrentes como
-- Vercel e VPS não precisam ser redigitados todo mês: quando a competência
-- consultada não tem linhas, a API cai para a competência anterior mais recente
-- (ver /api/admin/custos-operacionais).
--
-- IMPORTANTE: créditos de IA e o custo estimado por tokens (ai_usage) são
-- coisas distintas e NÃO devem ser somados como se fossem o mesmo número.
--   - créditos       = dinheiro real que abastecemos na OpenAI/Anthropic; é
--                      custo fixo operacional e mora nesta tabela.
--   - tokens/ai_usage = consumo estimado POR CLIENTE, usado para entender o uso
--                      real e precificar o produto. Fica só nos relatórios.
-- ============================================================================

create table if not exists custos_operacionais (
  id             uuid primary key default gen_random_uuid(),
  -- Primeiro dia do mês de referência (ex: 2026-07-01).
  competencia    date not null,
  -- Identificador do custo: 'vercel', 'supabase', 'vps', 'dominio',
  -- 'claude_pro', 'github', 'resend', 'creditos_openai',
  -- 'creditos_anthropic', 'num_clientes'.
  chave          text not null,
  valor          numeric(12,2) not null default 0,
  atualizado_em  timestamptz default now(),
  atualizado_por uuid references users(id),

  constraint custos_operacionais_competencia_chave_key unique (competencia, chave)
);

-- A API sempre consulta por competência (igualdade ou "a anterior mais
-- recente"), então o índice descendente serve aos dois casos.
create index if not exists idx_custos_operacionais_competencia
  on custos_operacionais (competencia desc);

alter table custos_operacionais enable row level security;

-- Mesma política de ai_usage: dado financeiro consolidado da Hubtek, não do
-- tenant. Nenhum admin_tenant ou operador enxerga esta tabela.
drop policy if exists "custos_operacionais_select" on custos_operacionais;
create policy "custos_operacionais_select" on custos_operacionais
  for select using (get_user_role() = 'admin_hubtek');

drop policy if exists "custos_operacionais_write" on custos_operacionais;
create policy "custos_operacionais_write" on custos_operacionais
  for all using (get_user_role() = 'admin_hubtek')
  with check (get_user_role() = 'admin_hubtek');

-- Semente com os valores que estavam fixos no código (CUSTOS_FIXOS_DEFAULT em
-- app/(admin)/admin/custos-ia/page.tsx), na competência do mês corrente, para a
-- tela não abrir zerada logo após a migration. Créditos entram em 0 — são o
-- valor que você lança manualmente a cada recarga.
insert into custos_operacionais (competencia, chave, valor)
values
  (date_trunc('month', now())::date, 'vercel',             98.27),
  (date_trunc('month', now())::date, 'supabase',          122.83),
  (date_trunc('month', now())::date, 'vps',                33.00),
  (date_trunc('month', now())::date, 'dominio',            12.81),
  (date_trunc('month', now())::date, 'claude_pro',        120.00),
  (date_trunc('month', now())::date, 'github',             19.65),
  (date_trunc('month', now())::date, 'resend',             98.27),
  (date_trunc('month', now())::date, 'creditos_openai',     0.00),
  (date_trunc('month', now())::date, 'creditos_anthropic',  0.00),
  (date_trunc('month', now())::date, 'num_clientes',        1.00)
on conflict (competencia, chave) do nothing;
