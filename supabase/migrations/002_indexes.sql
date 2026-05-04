-- ============================================================
-- HUBTEK SOLUTIONS — Índices complementares (Fase 2)
-- ============================================================

-- Unique parcial: impede conversas ativas duplicadas para o mesmo
-- número de telefone dentro do mesmo tenant. Conversas encerradas
-- (histórico) ficam sem restrição para permitir reabertura.
create unique index if not exists idx_conversations_tenant_phone_ativa
  on conversations(tenant_id, contato_telefone)
  where status != 'encerrado';
