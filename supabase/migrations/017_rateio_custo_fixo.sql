-- ============================================================================
-- 017_rateio_custo_fixo.sql
--
-- Corrige o custo fixo lançado nos ciclos já fechados.
--
-- PROBLEMA QUE ISSO RESOLVE
--   `calcularCustoFixoRateado` dividia o custo fixo do mês por `num_clientes`,
--   um número DIGITADO à mão na tela de custos. Ele ficou em 1 enquanto a base
--   crescia, então cada ciclo recebeu o custo fixo INTEIRO da operação em vez
--   da sua fatia — a operação inteira cobrada uma vez por cliente, por mês.
--
--   Em jul+ago/2026, com 2 clientes:
--     custo fixo real da operação ... R$   586,42  (293,21 x 2 meses)
--     lançado nos 4 ciclos .......... R$ 1.172,84  (293,21 x 2 clientes x 2 meses)
--
--   A margem do período aparecia como -R$ 1.189,18 quando o resultado real era
--   -R$ 602,76. O sinal estava certo (ninguém pagou nesses meses), a magnitude
--   não: quase o dobro do prejuízo real.
--
-- O QUE MUDA NO CÓDIGO
--   O divisor passou a ser CONTADO no banco, no fechamento e na tela de custos.
--   `num_clientes` continua sendo gravado em `custos_operacionais` como registro
--   histórico da competência, mas ninguém mais calcula em cima dele — um número
--   que precisa ser mantido à mão para o resultado financeiro sair certo é um
--   número que vai ficar errado.
--
-- O QUE ESTE SCRIPT FAZ
--   Recalcula `custo_fixo_rateado` de todo ciclo já fechado com a mesma regra
--   do código: total da competência (herdando a anterior quando o mês não tem
--   lançamento próprio) dividido pelos clientes que existiam naquele mês.
-- ============================================================================

with fixo_por_competencia as (
  -- `num_clientes` é parâmetro de rateio, não despesa: somá-lo inflaria o total.
  select
    competencia,
    sum(valor) filter (where chave <> 'num_clientes') as total
  from custos_operacionais
  group by competencia
),
ciclo_base as (
  select
    c.id,
    c.mes_ref,
    to_date(c.mes_ref || '-01', 'YYYY-MM-DD')                                as inicio_mes,
    (to_date(c.mes_ref || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date as fim_mes
  from ciclos_fechados c
),
calculado as (
  select
    cb.id,
    -- Competência mais recente que não é posterior ao mês: mesma herança que
    -- `calcularCustoFixoRateado` faz, senão um mês sem lançamento próprio sairia
    -- com custo fixo zero.
    (
      select f.total
      from fixo_por_competencia f
      where f.competencia <= cb.inicio_mes
      order by f.competencia desc
      limit 1
    ) as total_fixo,
    -- Todo cliente vivo no mês entra no divisor, inclusive conta demo e cliente
    -- em cortesia: consomem a mesma infraestrutura, e tirá-los empurraria o
    -- custo deles para quem paga. Arquivado saiu da operação; criado depois do
    -- mês não existia para ratear nada.
    (
      select count(*)
      from tenants t
      where coalesce(t.status_comercial, 'ativo') <> 'arquivado'
        and t.criado_em::date <= cb.fim_mes
    ) as num_clientes
  from ciclo_base cb
)
update ciclos_fechados c
   set custo_fixo_rateado = round((cal.total_fixo / greatest(cal.num_clientes, 1))::numeric, 2)
  from calculado cal
 where cal.id = c.id
   and cal.total_fixo is not null;

-- Alinha o registro histórico da competência com a contagem real, para um
-- relatório antigo não contradizer o número que a tela passa a mostrar.
update custos_operacionais
   set valor = (
     select count(*) from tenants t
      where coalesce(t.status_comercial, 'ativo') <> 'arquivado'
   )
 where chave = 'num_clientes';

-- ─── Verificação ────────────────────────────────────────────────────────────
--
-- Esperado: custo_fixo_rateado cai de R$ 293,21 para R$ 146,61 nos 4 ciclos, e
-- a margem total sai de -R$ 1.189,18 para cerca de -R$ 602,78 — o prejuizo real
-- de dois meses sem nenhum cliente pagante. Os centavos de diferenca para os
-- R$ 602,76 teoricos vem do arredondamento de um total impar dividido por dois.

select
  c.tenant_nome,
  c.mes_ref,
  c.valor_cobrado                     as receita_reconhecida,
  coalesce(c.motivo_sem_receita, 'faturado') as situacao,
  c.custo_brl                         as custo_api,
  c.custo_fixo_rateado,
  round(
    (c.valor_cobrado + coalesce(c.receita_inst_extras, 0) + coalesce(c.receita_creditos, 0)
     - c.custo_brl - coalesce(c.custo_fixo_rateado, 0))::numeric,
    2
  )                                   as margem_real
from ciclos_fechados c
order by c.mes_ref desc, c.tenant_nome;

select
  round(sum(
    c.valor_cobrado + coalesce(c.receita_inst_extras, 0) + coalesce(c.receita_creditos, 0)
    - c.custo_brl - coalesce(c.custo_fixo_rateado, 0)
  )::numeric, 2) as margem_total_periodo
from ciclos_fechados c;
