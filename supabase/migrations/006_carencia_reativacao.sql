-- ============================================================================
-- 006 — Carência de reescalonamento após reativação manual do agente
-- ============================================================================
-- Origem: rodada 2 de ajustes do tenant "Renovar Camas & Acessorios"
-- (28/07/2026). Ver ajustes-renovar-rodada2.md, Demanda 1.
--
-- Sintoma: um operador reativava o agente numa conversa e, na PRIMEIRA mensagem
-- seguinte do cliente, a conversa voltava sozinha para atendimento humano.
--
-- Causa: a tool `transferir_atendimento` decidia transferir de novo. O prompt da
-- Renovar manda transferir para o setor de fechamentos quando o cliente
-- demonstra intenção de compra — que, num agente de vendas, é o fluxo normal.
-- A reativação em si funcionava; o agente é que reescalava em seguida.
--
-- Reativar manualmente é uma decisão humana explícita ("quero o agente nesta
-- conversa"). Esta coluna registra o instante dessa decisão para que o agente
-- fique proibido de se auto-escalar por uma janela curta. Pedido explícito do
-- cliente (HUMANO_REGEX) continua valendo mesmo dentro da janela.
--
-- A janela é curta (2 min, definida em código) de propósito: longa demais
-- travaria transferências legítimas e o agente ficaria insistindo em atender
-- algo que não consegue resolver.
--
-- Esta migration é idempotente e não remove dado algum.
-- ----------------------------------------------------------------------------

alter table conversations
  add column if not exists agente_reativado_em timestamptz;

comment on column conversations.agente_reativado_em is
  'Instante da última reativação manual do agente nesta conversa. Durante a janela de carência seguinte o agente não pode se auto-escalar para humano. NULL = nunca reativado manualmente.';
