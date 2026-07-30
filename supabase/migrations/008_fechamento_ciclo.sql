-- ============================================================================
-- 008_fechamento_ciclo.sql
--
-- Corrige e completa o fechamento de ciclo (ciclos_fechados).
--
-- PROBLEMA 1 — `valor_cobrado` guardava a coisa errada.
--   /api/admin/fechar-ciclo gravava `valor_cobrado = custo_brl * 3`, uma
--   marcação sobre o custo de API. Mas admin/relatorios LÊ esse campo como o
--   VALOR DO PLANO (rotula a coluna "Plano" e soma as instâncias extras por
--   cima para chegar ao valor do cliente). Com planos de R$ 397 a R$ 3.500, o
--   relatório mostrava ~R$ 18 onde deveria mostrar a mensalidade. Somado ao
--   fato de que custo_brl vinha de uma tabela morta (ver migration 007 e o fix
--   de token_usage -> ai_usage), o resultado era relatório zerado.
--
-- PROBLEMA 2 — nada impedia fechar o mesmo ciclo duas vezes.
--   Sem restrição de unicidade, fechar o mesmo tenant/mês gerava duas linhas e
--   o relatório contava em dobro. Isso vira crítico agora que existe fechamento
--   automático na virada do mês: quem fecha adiantado pela tela e depois recebe
--   o fechamento do cron teria o ciclo duplicado.
--
-- PROBLEMA 3 — sem RLS.
--   `ciclos_fechados` foi criada na 003 sem RLS e sem política. É dado
--   financeiro de TODOS os tenants: qualquer usuário autenticado (inclusive um
--   admin_tenant ou operador de outro cliente) conseguia ler o faturamento
--   inteiro da operação. Fechado para admin_hubtek, como ai_usage.
-- ============================================================================

-- ─── Colunas novas ──────────────────────────────────────────────────────────
-- O relatório precisa saber o que foi cobrado E o que custou, separadamente.
-- Antes só existia `valor_cobrado`, com semântica ambígua.

alter table ciclos_fechados add column if not exists plano                 text;
alter table ciclos_fechados add column if not exists valor_plano           numeric(12,2) default 0;
alter table ciclos_fechados add column if not exists instancias_extras     integer       default 0;
alter table ciclos_fechados add column if not exists receita_inst_extras   numeric(12,2) default 0;
-- Custo fixo operacional rateado no mês (vem de custos_operacionais/007).
-- Guardado no fechamento porque o rateio muda quando entra ou sai cliente —
-- recalcular depois daria um número diferente do que valia no fechamento.
alter table ciclos_fechados add column if not exists custo_fixo_rateado    numeric(12,2) default 0;
alter table ciclos_fechados add column if not exists fechado_automatico    boolean       default false;

-- ─── Unicidade por tenant + mês ─────────────────────────────────────────────
-- Remove duplicatas existentes antes de criar o índice, mantendo o fechamento
-- MAIS RECENTE de cada (tenant_id, mes_ref).
delete from ciclos_fechados c
using ciclos_fechados mais_novo
where c.tenant_id = mais_novo.tenant_id
  and c.mes_ref   = mais_novo.mes_ref
  and c.fechado_em < mais_novo.fechado_em;

create unique index if not exists idx_ciclos_fechados_tenant_mes
  on ciclos_fechados (tenant_id, mes_ref);

-- ─── Permissões e RLS ───────────────────────────────────────────────────────
grant select, insert, update, delete on ciclos_fechados to authenticated;

alter table ciclos_fechados enable row level security;

drop policy if exists "ciclos_fechados_select" on ciclos_fechados;
create policy "ciclos_fechados_select" on ciclos_fechados
  for select using (get_user_role() = 'admin_hubtek');

drop policy if exists "ciclos_fechados_write" on ciclos_fechados;
create policy "ciclos_fechados_write" on ciclos_fechados
  for all using (get_user_role() = 'admin_hubtek')
  with check (get_user_role() = 'admin_hubtek');

notify pgrst, 'reload schema';
