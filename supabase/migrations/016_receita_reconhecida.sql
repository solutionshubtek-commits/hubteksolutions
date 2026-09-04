-- ============================================================================
-- 016_receita_reconhecida.sql
--
-- Separa "mensalidade contratada" de "receita que a Hubtek realmente recebeu".
--
-- PROBLEMA QUE ISSO RESOLVE
--   O fechamento gravava `valor_cobrado = valor do plano` para TODO ciclo, sem
--   perguntar se aquele mês foi de fato faturado. Com isso a margem estimada da
--   tela de relatórios mostrava ~R$ 6,6 mil que nunca entraram no caixa:
--
--     - 2 ciclos da própria Hubtek Solutions (conta demo, R$ 3.500/mês);
--     - 2 ciclos do Renovar Camas (jul e ago/2026), que foram bônus de
--       implantação — o cliente não pagou mensalidade nesse período.
--
--   Números de custo estavam certos; o que estava errado era tratar mensalidade
--   contratada como receita realizada.
--
-- O QUE NÃO MUDA
--   Conversas, tokens, custo de API e custo fixo rateado continuam sendo
--   gravados e exibidos igual para esses ciclos. A operação existiu e custou
--   dinheiro — esconder isso trocaria um erro por outro. O ciclo sem receita
--   passa a mostrar margem NEGATIVA, que é o resultado real dele.
-- ============================================================================

-- ─── Cortesia de FATURAMENTO (diferente da cortesia de recursos) ────────────
--
-- `cortesia_recursos_ate` (migration 012) libera FUNCIONALIDADE acima do plano
-- e não diz nada sobre cobrança. Esta coluna é o outro eixo: até quando aquele
-- cliente não paga mensalidade. São independentes de propósito — existe cliente
-- pagante com recurso liberado por cortesia, e existe cliente em bônus de
-- implantação usando exatamente o que o plano dele dá.
--
-- Guardada como data (não mês) para o caso comum de um bônus que termina no
-- meio do mês; o fechamento compara com o primeiro dia do mês de referência.

alter table tenants add column if not exists faturamento_cortesia_ate date;

comment on column tenants.faturamento_cortesia_ate is
  'Enquanto o ciclo começar até esta data, a mensalidade não é reconhecida como receita (bônus de implantação, período de teste). Independente de cortesia_recursos_ate.';

-- ─── Por que aquele ciclo não gerou receita ─────────────────────────────────
--
-- `valor_cobrado` continua sendo a fonte da margem (zerado quando não há
-- receita); esta coluna existe para que a tela consiga DIZER o motivo. Sem ela,
-- um ciclo de R$ 0,00 vira suspeita de bug — e a primeira reação seria
-- "re-fechar o ciclo para corrigir", que não corrigiria nada.
--
-- `valor_plano` NÃO é zerado: continua registrando a mensalidade contratada
-- naquele mês, que é informação de contrato, não de caixa.

alter table ciclos_fechados add column if not exists motivo_sem_receita text;

alter table ciclos_fechados
  drop constraint if exists ciclos_fechados_motivo_sem_receita_check;
alter table ciclos_fechados
  add constraint ciclos_fechados_motivo_sem_receita_check
  check (motivo_sem_receita is null or motivo_sem_receita in ('conta_demo', 'cortesia', 'sem_acesso'));

comment on column ciclos_fechados.motivo_sem_receita is
  'null = ciclo faturado normalmente. conta_demo | cortesia | sem_acesso = mensalidade não reconhecida como receita.';

-- ─── Backfill do que já está fechado ────────────────────────────────────────

-- A conta da própria Hubtek é demo e nunca foi faturada. A flag `conta_demo`
-- já existia (migration 010) mas só era usada para liberar expurgo antes da
-- retenção legal; agora ela também governa receita.
update tenants
   set conta_demo = true
 where nome = 'Hubtek Solutions'
   and conta_demo is distinct from true;

-- Renovar Camas: jul e ago/2026 foram bônus de implantação. A cobrança começa
-- em setembro, então a cortesia termina no último dia de agosto.
update tenants
   set faturamento_cortesia_ate = date '2026-08-31'
 where nome = 'Renovar Camas & Acessórios'
   and faturamento_cortesia_ate is null;

-- Ciclos de conta demo.
update ciclos_fechados c
   set valor_cobrado = 0,
       receita_inst_extras = 0,
       motivo_sem_receita = 'conta_demo'
  from tenants t
 where t.id = c.tenant_id
   and t.conta_demo = true
   and c.motivo_sem_receita is null;

-- Ciclos dentro do período de cortesia. `mes_ref` é 'YYYY-MM'; o ciclo entra na
-- cortesia quando o mês dele COMEÇA até a data limite.
update ciclos_fechados c
   set valor_cobrado = 0,
       receita_inst_extras = 0,
       motivo_sem_receita = 'cortesia'
  from tenants t
 where t.id = c.tenant_id
   and t.faturamento_cortesia_ate is not null
   and to_date(c.mes_ref || '-01', 'YYYY-MM-DD') <= t.faturamento_cortesia_ate
   and c.motivo_sem_receita is null;

-- Nota: ciclos de cliente sem acesso ('sem_acesso') não entram em backfill.
-- Esse motivo é decidido no fechamento, com o estado do cliente NAQUELE mês, e
-- reconstituí-lo agora a partir do estado de hoje reescreveria o passado —
-- exatamente o que se decidiu não fazer.

notify pgrst, 'reload schema';

-- ─── Verificação ────────────────────────────────────────────────────────────
--
-- Rode junto: o resultado mostra como cada ciclo ficou. O esperado é que os 4
-- ciclos de jul/ago apareçam com valor_cobrado 0 e um motivo preenchido, e que
-- a margem total do período fique NEGATIVA — o custo real de operar duas
-- contas que não faturam.

select
  c.tenant_nome,
  c.mes_ref,
  c.valor_plano                       as mensalidade_contratada,
  c.valor_cobrado                     as receita_reconhecida,
  coalesce(c.motivo_sem_receita, 'faturado') as situacao,
  c.conversas,
  c.tokens,
  c.custo_brl                         as custo_api,
  c.custo_fixo_rateado,
  round(
    (c.valor_cobrado + coalesce(c.receita_inst_extras, 0) + coalesce(c.receita_creditos, 0)
     - c.custo_brl - coalesce(c.custo_fixo_rateado, 0))::numeric,
    2
  )                                   as margem_real
from ciclos_fechados c
order by c.mes_ref desc, c.tenant_nome;
