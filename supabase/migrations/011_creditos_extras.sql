-- ============================================================================
-- 011_creditos_extras.sql
--
-- Créditos extras de atendimento. Substitui o upgrade automático de plano por
-- um modelo em que, ao esgotar a franquia, o agente para e o cliente escolhe:
-- subir de plano ou comprar créditos avulsos (R$ 4,50 cada, validade 90 dias).
--
-- ESTA MIGRATION É PURAMENTE ADITIVA. Cria três tabelas novas e uma função.
-- Nenhuma coluna existente é alterada e nada passa a ler daqui ainda — o
-- caminho novo só entra em operação nas etapas seguintes, atrás de flag.
--
-- ---------------------------------------------------------------------------
-- A UNIDADE COBRADA: 1 ATENDIMENTO POR CONTATO POR CICLO
--
-- Hoje a contagem é derivada, não incremental: `count(*)` sobre conversations
-- filtrando `criado_em >= início do mês` (process-webhook/route.ts e
-- upgrade-plano/route.ts fazem isso, cada um por conta própria).
--
-- O efeito colateral disso é que `reativarOuCriarConversa` REABRE a mesma
-- linha quando um contato antigo volta — mesmo id, mesmo criado_em. Ou seja,
-- na regra atual um contato recorrente é cobrado UMA ÚNICA VEZ na vida dele.
-- Um cliente com base fiel praticamente nunca atinge a franquia.
--
-- A regra nova: cada contato consome 1 unidade POR CICLO. Dentro do mesmo mês
-- ele pode encerrar e voltar quantas vezes quiser sem consumir de novo;
-- virando o mês, consome 1. Daí a chave ser (conversation_id, ciclo_ref) e
-- não conversation_id sozinho — este último travaria a conversa para sempre e
-- o crédito extra nunca seria consumido numa reabertura.
--
-- CONSEQUÊNCIA COMERCIAL: isto aumenta o consumo medido dos clientes atuais.
-- É exatamente por isso que a etapa seguinte roda em modo sombra por um ciclo
-- inteiro antes de qualquer bloqueio entrar em vigor.
--
-- ---------------------------------------------------------------------------
-- ORDEM DE CONSUMO (garantida dentro da RPC, nenhum cron reordena nada)
--   1. Franquia do plano no ciclo corrente
--   2. Créditos comprados válidos, do que expira PRIMEIRO para o último
--   3. Sem franquia e sem crédito -> bloqueia
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. LOTES DE CRÉDITOS COMPRADOS
--
-- Cada compra é um lote com validade própria. Precisa ser assim por causa dos
-- 90 dias: um saldo único não saberia qual parte vence quando, e a regra de
-- consumir o que expira primeiro (que protege o cliente de perder crédito)
-- ficaria impossível de aplicar.
-- ---------------------------------------------------------------------------
create table if not exists public.credito_pacotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  origem text not null default 'pacote',
  quantidade_total int not null check (quantidade_total > 0),
  quantidade_restante int not null check (quantidade_restante >= 0),
  valor_unitario numeric(10,2) not null default 4.50,
  valor_pago numeric(10,2) not null,
  status text not null default 'ativo',
  ativado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  constraint credito_pacotes_origem_valida
    check (origem in ('pacote_20', 'pacote_50', 'pacote_100', 'personalizado', 'pacote')),
  constraint credito_pacotes_status_valido
    check (status in ('ativo', 'esgotado', 'expirado')),
  constraint credito_pacotes_restante_coerente
    check (quantidade_restante <= quantidade_total)
);

-- Índice desenhado para a consulta quente da RPC: pega o lote vivo do tenant
-- que expira primeiro. A ordem das colunas segue a ordem dos filtros.
create index if not exists idx_credito_pacotes_consumo
  on public.credito_pacotes (tenant_id, status, expira_em);

comment on table public.credito_pacotes is
  'Lotes de créditos extras comprados. Um lote por compra, com validade própria de 90 dias.';


-- ---------------------------------------------------------------------------
-- 2. LEDGER DE CONSUMO
--
-- Passa a ser a fonte da verdade da contagem:
--   franquia usada = count(*) where origem='franquia' and ciclo_ref = <atual>
--   saldo créditos = sum(quantidade_restante) dos pacotes ativos não vencidos
--
-- Durante o modo sombra o caminho legado continua rodando em paralelo, para
-- comparação. Só depois de validado é que a dashboard passa a ler daqui.
-- ---------------------------------------------------------------------------
create table if not exists public.atendimento_consumo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  ciclo_ref text not null,
  origem text not null,
  pacote_id uuid references public.credito_pacotes(id),
  consumido_em timestamptz not null default now(),

  constraint atendimento_consumo_origem_valida
    check (origem in ('franquia', 'credito')),

  -- Trava dura de idempotência. É ela que protege contra os webhooks
  -- duplicados da Evolution: mesmo que a RPC seja chamada duas vezes para a
  -- mesma conversa no mesmo ciclo, o banco recusa o segundo consumo.
  constraint atendimento_consumo_unico_por_ciclo
    unique (conversation_id, ciclo_ref)
);

-- Serve as duas leituras quentes: quanto da franquia já foi usada no ciclo
-- (a RPC faz isso a cada atendimento) e o relatório por origem.
create index if not exists idx_atendimento_consumo_ciclo
  on public.atendimento_consumo (tenant_id, ciclo_ref, origem);

comment on table public.atendimento_consumo is
  'Ledger de atendimentos consumidos. Fonte da verdade da contagem. 1 linha por contato por ciclo.';


-- ---------------------------------------------------------------------------
-- 3. SOLICITAÇÕES DE COMPRA
--
-- O billing ainda é manual: o cliente solicita, a Hubtek confirma o pagamento
-- e aprova. Só na aprovação o lote em credito_pacotes nasce — solicitação
-- pendente não vira saldo. Quando entrar Stripe, o passo "aprovar" vira o
-- webhook de pagamento e o resto da lógica não muda.
-- ---------------------------------------------------------------------------
create table if not exists public.credito_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quantidade int not null check (quantidade > 0),
  valor_total numeric(10,2) not null,
  tipo text not null default 'pacote',
  status text not null default 'pendente',
  solicitado_por uuid references public.users(id),
  solicitado_em timestamptz not null default now(),
  aprovado_por uuid references public.users(id),
  aprovado_em timestamptz,
  pacote_id uuid references public.credito_pacotes(id),
  constraint credito_solicitacoes_tipo_valido
    check (tipo in ('pacote', 'personalizado')),
  constraint credito_solicitacoes_status_valido
    check (status in ('pendente', 'aprovada', 'recusada'))
);

create index if not exists idx_credito_solicitacoes_status
  on public.credito_solicitacoes (tenant_id, status);

comment on table public.credito_solicitacoes is
  'Pedidos de compra de créditos. Vira lote em credito_pacotes apenas quando aprovada.';


-- ---------------------------------------------------------------------------
-- 4. FUNÇÃO CENTRAL DE CONSUMO
--
-- Chamada UMA ÚNICA VEZ por atendimento faturável, no mesmo ponto onde a
-- conversa nasce hoje. Nunca criar um segundo ponto de contagem.
--
-- Duas garantias, ambas no banco (não confiar só no Redis, que é lock de
-- debounce e pode expirar):
--   - idempotência: unique (conversation_id, ciclo_ref)
--   - atomicidade:  pg_advisory_xact_lock serializa o tenant na transação,
--                   evitando que duas mensagens simultâneas leiam a mesma
--                   franquia restante e consumam duas vezes o último saldo
-- ---------------------------------------------------------------------------
create or replace function public.consumir_atendimento(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_ciclo_ref text,
  p_franquia int
)
returns table (
  permitido boolean,
  origem text,
  pacote_id uuid,
  saldo_franquia int,
  saldo_creditos int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existente record;
  v_usado_franquia int;
  v_pacote record;
  v_saldo_creditos int;
begin
  -- Idempotência: já consumiu neste ciclo? Devolve o que foi registrado antes
  -- e não consome de novo. Saldos vêm null de propósito: esta chamada não
  -- alterou nada, e um número aqui daria a impressão de um consumo novo.
  select ac.origem, ac.pacote_id into v_existente
  from public.atendimento_consumo ac
  where ac.conversation_id = p_conversation_id
    and ac.ciclo_ref = p_ciclo_ref
  limit 1;

  if found then
    return query select true, v_existente.origem, v_existente.pacote_id, null::int, null::int;
    return;
  end if;

  -- Serializa este tenant pelo resto da transação. Só bloqueia chamadas do
  -- mesmo tenant; tenants diferentes seguem em paralelo.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));

  -- O alias `ac` não é enfeite: `origem` e `pacote_id` também são nomes das
  -- colunas de RETORNO desta função, e portanto variáveis no escopo dela. Sem
  -- qualificar, o Postgres recusa a query inteira com "column reference
  -- 'origem' is ambiguous" e a função nunca chega a consumir nada.
  select count(*) into v_usado_franquia
  from public.atendimento_consumo ac
  where ac.tenant_id = p_tenant_id
    and ac.ciclo_ref = p_ciclo_ref
    and ac.origem = 'franquia';

  -- 1) FRANQUIA DO PLANO primeiro, sempre. Mesmo havendo crédito comprado
  --    disponível: o crédito é mais caro e tem validade, então gastá-lo antes
  --    da franquia seria prejuízo para o cliente.
  if v_usado_franquia < p_franquia then
    insert into public.atendimento_consumo (tenant_id, conversation_id, ciclo_ref, origem)
    values (p_tenant_id, p_conversation_id, p_ciclo_ref, 'franquia');

    select coalesce(sum(cp.quantidade_restante), 0)::int into v_saldo_creditos
    from public.credito_pacotes cp
    where cp.tenant_id = p_tenant_id and cp.status = 'ativo' and cp.expira_em > now();

    return query select true, 'franquia'::text, null::uuid,
      (p_franquia - v_usado_franquia - 1), v_saldo_creditos;
    return;
  end if;

  -- 2) CRÉDITO COMPRADO, o que expira primeiro. Consumir nessa ordem é o que
  --    evita o cliente perder saldo por validade tendo lote mais novo em mão.
  select cp.id, cp.quantidade_restante into v_pacote
  from public.credito_pacotes cp
  where cp.tenant_id = p_tenant_id
    and cp.status = 'ativo'
    and cp.quantidade_restante > 0
    and cp.expira_em > now()
  order by cp.expira_em asc
  limit 1
  for update;

  if found then
    update public.credito_pacotes
      set quantidade_restante = quantidade_restante - 1,
          status = case when quantidade_restante - 1 = 0 then 'esgotado' else 'ativo' end
      where id = v_pacote.id;

    insert into public.atendimento_consumo (tenant_id, conversation_id, ciclo_ref, origem, pacote_id)
    values (p_tenant_id, p_conversation_id, p_ciclo_ref, 'credito', v_pacote.id);

    select coalesce(sum(cp.quantidade_restante), 0)::int into v_saldo_creditos
    from public.credito_pacotes cp
    where cp.tenant_id = p_tenant_id and cp.status = 'ativo' and cp.expira_em > now();

    return query select true, 'credito'::text, v_pacote.id, 0, v_saldo_creditos;
    return;
  end if;

  -- 3) Sem franquia e sem crédito válido.
  return query select false, 'bloqueado'::text, null::uuid, 0, 0;
end;
$$;

comment on function public.consumir_atendimento(uuid, uuid, text, int) is
  'Consome 1 atendimento: franquia -> crédito que expira primeiro -> bloqueio. Idempotente por (conversa, ciclo).';

-- SECURITY DEFINER + execução restrita ao service role: quem decide se um
-- atendimento é consumido é o servidor, nunca o browser. Revoga-se o padrão
-- de `public` antes de conceder, senão authenticated herda o execute.
revoke all on function public.consumir_atendimento(uuid, uuid, text, int) from public;
grant execute on function public.consumir_atendimento(uuid, uuid, text, int) to service_role;


-- ---------------------------------------------------------------------------
-- 5. RLS
--
-- Leitura: o tenant enxerga o que é dele, admin_hubtek enxerga tudo.
-- Escrita: nenhuma policy — só o service role (que ignora RLS) escreve, via
-- RPC e rotas de servidor. Um cliente não pode criar o próprio crédito.
-- ---------------------------------------------------------------------------
alter table public.credito_pacotes       enable row level security;
alter table public.atendimento_consumo   enable row level security;
alter table public.credito_solicitacoes  enable row level security;

grant select on public.credito_pacotes      to authenticated;
grant select on public.atendimento_consumo  to authenticated;
grant select on public.credito_solicitacoes to authenticated;

drop policy if exists "credito_pacotes_select" on public.credito_pacotes;
create policy "credito_pacotes_select" on public.credito_pacotes
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

drop policy if exists "atendimento_consumo_select" on public.atendimento_consumo;
create policy "atendimento_consumo_select" on public.atendimento_consumo
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

drop policy if exists "credito_solicitacoes_select" on public.credito_solicitacoes;
create policy "credito_solicitacoes_select" on public.credito_solicitacoes
  for select using (
    get_user_role() = 'admin_hubtek'
    or tenant_id = get_user_tenant_id()
  );

notify pgrst, 'reload schema';
