-- ============================================================================
-- 012_cortesia_recursos.sql
--
-- Cortesia temporária de recursos por cliente.
--
-- A liberação de recursos por plano (CRM a partir do Acelerador, Agendamentos
-- a partir do Essencial) entra com clientes já usando o que o plano deles
-- passa a não incluir. Tirar o acesso no mesmo dia seria quebrar serviço em
-- uso, sem aviso.
--
-- Esta coluna dá o prazo: enquanto `now() < cortesia_recursos_ate`, o tenant
-- enxerga TODOS os recursos, independente do plano. Vencido o prazo, os gates
-- passam a valer sozinhos — sem deploy, sem cron, sem ninguém lembrar de
-- desligar nada. É essa expiração automática que faz a cortesia não virar
-- permanente por esquecimento.
--
-- Nulo = sem cortesia, regra do plano valendo desde já. É o padrão de todo
-- cliente novo.
--
-- ATENÇÃO: a cortesia cobre RECURSOS (crm, agendamentos), não os limites
-- numéricos de operadores e instâncias — esses seguem o plano o tempo todo.
-- ============================================================================

alter table public.tenants
  add column if not exists cortesia_recursos_ate timestamptz;

comment on column public.tenants.cortesia_recursos_ate is
  'Enquanto no futuro, libera todos os recursos independente do plano. Nulo = regra do plano.';

notify pgrst, 'reload schema';
