-- ============================================================================
-- 013_bloqueio_atendimento.sql
--
-- Estado de bloqueio por franquia esgotada.
--
-- Com o fim do upgrade automático, o cliente que esgota a franquia e não tem
-- crédito para de ter novas conversas atendidas. Estas colunas guardam esse
-- estado para a dashboard mostrar o banner e para a notificação não ser
-- reenviada a cada mensagem que chega.
--
-- IMPORTANTE — ISTO NÃO É A FONTE DA DECISÃO.
-- Quem decide se um atendimento acontece é sempre a RPC consumir_atendimento,
-- chamada a cada mensagem. A tentação seria usar esta flag como atalho ("está
-- bloqueado? nem chama a RPC"), e isso estaria ERRADO: uma conversa que já
-- consumiu no ciclo continua sendo atendida mesmo com o tenant bloqueado —
-- ela já foi paga. Só a RPC sabe disso, porque a idempotência é por
-- (conversa, ciclo). O atalho calaria o agente em conversas em andamento.
--
-- Portanto: estas colunas são REFLEXO do que a RPC decidiu, para UI e aviso.
-- Nunca condição de entrada.
--
-- Limpeza: quando créditos são aprovados, quando o plano sobe, ou na virada de
-- ciclo (a franquia nova zera o consumo, já que o ledger conta por ciclo_ref).
-- ============================================================================

alter table public.tenants
  add column if not exists atendimento_bloqueado boolean not null default false,
  add column if not exists bloqueado_em timestamptz;

comment on column public.tenants.atendimento_bloqueado is
  'Reflexo da ultima decisao da RPC: franquia e creditos esgotados. Para UI e aviso, nunca para decidir atendimento.';

comment on column public.tenants.bloqueado_em is
  'Quando o bloqueio comecou. Usado para nao reenviar o aviso a cada mensagem.';

-- Índice parcial: a lista de bloqueados é consultada pelo admin e pelos
-- avisos, e é quase sempre um punhado de linhas num universo de tenants.
create index if not exists idx_tenants_bloqueados
  on public.tenants (atendimento_bloqueado)
  where atendimento_bloqueado = true;

notify pgrst, 'reload schema';
