-- ============================================================================
-- 014_receita_creditos.sql
--
-- Receita de créditos extras no fechamento de ciclo.
--
-- A margem em ciclos_fechados soma valor do plano e instâncias extras, e
-- subtrai custo de IA e custo fixo rateado. Crédito extra não entrava em lugar
-- nenhum — então, a partir do momento em que os créditos começam a vender, o
-- resultado do cliente sai SUBESTIMADO justamente para quem consome mais, que
-- é quem puxa o custo de IA e o rateio para cima.
--
-- ---------------------------------------------------------------------------
-- POR QUE DUAS VISÕES, E NÃO UMA
--
-- Um pacote comprado em agosto pode ser consumido em outubro. O custo de IA
-- daquele atendimento cai em outubro, junto com o rateio do mês. Registrar a
-- receita só na venda descasaria receita e custo: agosto pareceria excelente e
-- outubro pareceria prejuízo, sem que nada tivesse mudado na operação.
--
--   receita_creditos        COMPETÊNCIA — reconhecida no mês em que o crédito
--                           foi CONSUMIDO. Casa com o custo de IA do mesmo mês,
--                           e é esta que entra na MARGEM. É a que responde
--                           "este cliente dá lucro ou prejuízo?".
--
--   creditos_vendidos_valor CAIXA — pago pelos lotes ATIVADOS no mês. Serve à
--                           conciliação financeira e à leitura comercial de
--                           quanto se vendeu, mas não entra na margem.
--
-- As duas juntas também mostram o passivo: vendido muito acima do consumido
-- significa crédito parado que ainda vai custar IA em algum mês futuro — ou
-- expirar em 90 dias sem custo nenhum, virando margem pura.
-- ============================================================================

alter table ciclos_fechados
  add column if not exists atendimentos_credito     integer       default 0,
  add column if not exists receita_creditos         numeric(12,2) default 0,
  add column if not exists creditos_vendidos_qtd    integer       default 0,
  add column if not exists creditos_vendidos_valor  numeric(12,2) default 0;

comment on column ciclos_fechados.receita_creditos is
  'Competencia: receita dos creditos CONSUMIDOS no mes. Entra na margem, pois casa com o custo de IA do periodo.';

comment on column ciclos_fechados.creditos_vendidos_valor is
  'Caixa: valor pago pelos lotes ativados no mes. Conciliacao financeira, NAO entra na margem.';

notify pgrst, 'reload schema';
