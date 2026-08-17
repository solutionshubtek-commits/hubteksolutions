# Nova estrutura: Créditos extras de atendimento (Hubtek Agents)

> Documento de especificação para validação e implementação assistida (Claude no Cursor).
> **Atenção:** mexe na lógica central de contagem/faturamento e há clientes reais em produção.
> A implementação é **aditiva** e faseada. Nada de contagem/faturamento atual é apagado antes de validar o novo caminho.

---

## 1. Objetivo

Substituir o **upgrade automático de plano** (comportamento atual ao estourar a franquia) por um modelo em que, ao atingir o limite de atendimentos do plano, **o agente para e o cliente escolhe**:

1. Fazer upgrade de plano (entrando em contato conosco), ou
2. Comprar pacotes de **créditos extras** de atendimento (avulsos).

Os créditos extras funcionam como os créditos avulsos das ferramentas de IA: são mais caros que o atendimento do plano, têm validade e só entram em ação quando a franquia do plano acaba.

---

## 2. Regras confirmadas (fonte da verdade da lógica)

1. **Auto-upgrade DESLIGADO.** Ao bater o teto da franquia, o agente para de atender novas conversas e o cliente é avisado para escolher (upgrade OU comprar créditos). O comportamento antigo de subir de plano sozinho e reverter no mês seguinte deixa de existir.
2. **Créditos comprados só são consumidos depois de esgotar 100% da franquia do plano no ciclo.**
3. **Na virada do mês**, com a franquia renovada e ainda havendo créditos comprados válidos (dentro dos 90 dias): **consome toda a franquia nova primeiro; os créditos comprados só voltam a ser usados se estourar a franquia de novo.**
4. **Validade dos créditos comprados: 90 dias** a partir da ativação (confirmação do pagamento). Passou de 90 dias, o saldo restante é perdido.
5. **Ordem de prioridade de consumo (regra de ouro, sempre nesta ordem):**
   1. Franquia do plano (ciclo atual)
   2. Créditos comprados válidos, **do que expira primeiro para o que expira por último** (evita perda por validade)
   3. Se não há franquia nem crédito válido → **bloqueia** e avisa o cliente

### 2.1 Preços dos créditos extras

- Valor unitário do atendimento adicional: **R$ 4,50**
- Pacotes fechados:
  - **+20 créditos = R$ 90,00**
  - **+50 créditos = R$ 225,00**
  - **+100 créditos = R$ 450,00**
- **Quantidade personalizada:** botão "Solicitar quantidade" → gera uma solicitação para a Hubtek fazer o cálculo e liberar manualmente.

> Observação: "atendimento" = a mesma unidade de hoje (1 conversa por janela de 24h). O crédito extra é 1 atendimento adicional, contado exatamente como a franquia já conta.

---

## 3. Fluxo de decisão (ao registrar um novo atendimento faturável)

```
Chega uma nova conversa faturável (janela de 24h nova para o contato)
        │
        ▼
Esta conversa já consumiu 1 unidade neste ciclo?  ── SIM ──► não consome de novo (idempotência) ► segue
        │ NÃO
        ▼
Ainda há franquia do plano no ciclo?  ── SIM ──► consome 1 da FRANQUIA ► agente atende
        │ NÃO
        ▼
Há crédito comprado válido (dentro de 90 dias)?  ── SIM ──► consome 1 do pacote que EXPIRA PRIMEIRO ► agente atende
        │ NÃO
        ▼
BLOQUEIA: agente não atende novas conversas + avisa o cliente (upgrade ou comprar créditos)
```

### 3.1 Exemplo prático (plano Iniciante, franquia 50)

| Evento | Franquia usada | Crédito usado | Resultado |
|---|---|---|---|
| Conversas 1 a 50 | 50/50 | 0 | Atende (franquia) |
| Conversa 51 (sem crédito) | 50/50 | 0 | **Bloqueia** e avisa |
| Cliente compra +20 (R$ 90) | 50/50 | saldo 20 | Desbloqueia |
| Conversas 51 a 70 | 50/50 | 20/20 | Atende (crédito) |
| Conversa 71 | 50/50 | 20/20 | **Bloqueia** de novo |
| **Virada do mês** (franquia volta a 50; comprou +20 mas usou tudo) | 0/50 | 0 | Consome franquia primeiro |

Se na virada ainda restassem créditos válidos (ex.: comprou 50 e usou 20), a franquia nova (50) é consumida integralmente **antes** de tocar nos 30 créditos restantes, e esses 30 seguem valendo até o fim dos 90 dias.

---

## 4. Modelo de dados (novas tabelas — aditivo, nada é alterado no que existe)

> Rodar no Supabase. **Não** altera colunas existentes. Cada compra é um **lote** com validade própria (necessário por causa dos 90 dias e do consumo "expira primeiro").

```sql
-- 4.1 Lotes de créditos comprados
create table if not exists public.credito_pacotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  origem text not null default 'pacote',          -- pacote_20 | pacote_50 | pacote_100 | personalizado
  quantidade_total int not null check (quantidade_total > 0),
  quantidade_restante int not null check (quantidade_restante >= 0),
  valor_unitario numeric(10,2) not null default 4.50,
  valor_pago numeric(10,2) not null,
  status text not null default 'ativo',            -- ativo | esgotado | expirado
  ativado_em timestamptz not null default now(),   -- início da validade (pagamento confirmado)
  expira_em timestamptz not null,                  -- ativado_em + 90 dias
  criado_em timestamptz not null default now()
);
create index if not exists idx_credito_pacotes_consumo
  on public.credito_pacotes (tenant_id, status, expira_em);

-- 4.2 Ledger de consumo (idempotência por conversa + auditoria/relatório)
create table if not exists public.atendimento_consumo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  ciclo_ref text not null,                         -- ex.: '2026-08' ou id do ciclo vigente
  origem text not null,                            -- franquia | credito
  pacote_id uuid references public.credito_pacotes(id),
  consumido_em timestamptz not null default now(),
  unique (conversation_id)                         -- 1 consumo por conversa (trava dura)
);
create index if not exists idx_atendimento_consumo_ciclo
  on public.atendimento_consumo (tenant_id, ciclo_ref, origem);

-- 4.3 Solicitações de compra (fluxo manual, alinhado ao billing atual)
create table if not exists public.credito_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quantidade int not null check (quantidade > 0),
  valor_total numeric(10,2) not null,
  tipo text not null default 'pacote',             -- pacote | personalizado
  status text not null default 'pendente',         -- pendente | aprovada | recusada
  solicitado_por uuid references public.users(id),
  solicitado_em timestamptz not null default now(),
  aprovado_por uuid references public.users(id),
  aprovado_em timestamptz,
  pacote_id uuid references public.credito_pacotes(id)  -- lote gerado ao aprovar
);
create index if not exists idx_credito_solicitacoes_status
  on public.credito_solicitacoes (tenant_id, status);
```

### 4.1 Fonte da verdade da contagem

O **ledger `atendimento_consumo` passa a ser a fonte da verdade** do consumo:

- Franquia usada no ciclo = `count(*) where origem='franquia' and ciclo_ref = <ciclo atual>`
- Saldo de créditos = `sum(quantidade_restante)` dos pacotes `ativo` e `expira_em > now()`

Durante o rollout (seção 11), o contador legado continua sendo atualizado em paralelo para comparação. Só depois de validado é que a dashboard passa a ler do ledger.

---

## 5. Função central de consumo (RPC atômica — evita corrida e duplicidade)

> **Ponto mais sensível.** Chamada **uma única vez por nova conversa faturável**, no mesmo lugar onde hoje o contador de conversas incrementa. Idempotente por `conversation_id` (protege contra os webhooks duplicados da Evolution) e atômica por tenant (`pg_advisory_xact_lock`).

```sql
create or replace function public.consumir_atendimento(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_ciclo_ref text,
  p_franquia int
)
returns table (permitido boolean, origem text, pacote_id uuid, saldo_franquia int, saldo_creditos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ja int;
  v_usado_franquia int;
  v_pacote record;
begin
  -- Idempotência: conversa já consumiu neste ciclo? devolve o que já foi registrado, sem novo consumo
  select count(*) into v_ja from public.atendimento_consumo where conversation_id = p_conversation_id;
  if v_ja > 0 then
    return query
      select true, ac.origem, ac.pacote_id, null::int, null::int
      from public.atendimento_consumo ac
      where ac.conversation_id = p_conversation_id
      limit 1;
    return;
  end if;

  -- Serializa o tenant durante a transação (evita consumir 2x em mensagens simultâneas)
  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));

  select count(*) into v_usado_franquia
  from public.atendimento_consumo
  where tenant_id = p_tenant_id and ciclo_ref = p_ciclo_ref and origem = 'franquia';

  -- 1) FRANQUIA primeiro
  if v_usado_franquia < p_franquia then
    insert into public.atendimento_consumo (tenant_id, conversation_id, ciclo_ref, origem)
    values (p_tenant_id, p_conversation_id, p_ciclo_ref, 'franquia');
    return query select true, 'franquia'::text, null::uuid,
      (p_franquia - v_usado_franquia - 1),
      coalesce((select sum(quantidade_restante) from public.credito_pacotes
                where tenant_id = p_tenant_id and status='ativo' and expira_em > now()),0)::int;
    return;
  end if;

  -- 2) CRÉDITO comprado (o que expira primeiro)
  select * into v_pacote
  from public.credito_pacotes
  where tenant_id = p_tenant_id and status = 'ativo'
    and quantidade_restante > 0 and expira_em > now()
  order by expira_em asc
  limit 1
  for update;

  if found then
    update public.credito_pacotes
      set quantidade_restante = quantidade_restante - 1,
          status = case when quantidade_restante - 1 = 0 then 'esgotado' else 'ativo' end
      where id = v_pacote.id;
    insert into public.atendimento_consumo (tenant_id, conversation_id, ciclo_ref, origem, pacote_id)
    values (p_tenant_id, p_conversation_id, p_ciclo_ref, 'credito', v_pacote.id);
    return query select true, 'credito'::text, v_pacote.id, 0,
      coalesce((select sum(quantidade_restante) from public.credito_pacotes
                where tenant_id = p_tenant_id and status='ativo' and expira_em > now()),0)::int;
    return;
  end if;

  -- 3) BLOQUEIO
  return query select false, 'bloqueado'::text, null::uuid, 0, 0;
end;
$$;

-- Permissão de execução (a RPC é SECURITY DEFINER; chamar pelo service role no server)
grant execute on function public.consumir_atendimento(uuid, uuid, text, int) to service_role;
```

> **Regra:** essa RPC **não** substitui o contador legado durante o shadow mode; ela roda em paralelo. Só depois de validada ela vira a decisão que libera/bloqueia o atendimento.

---

## 6. Configuração em `lib/planos.ts` (fonte única — nunca hardcodar em outro lugar)

Adicionar (sem remover nada do que já existe):

```ts
// Créditos extras de atendimento
export const CREDITO_EXTRA = {
  valorUnitario: 4.50,
  validadeDias: 90,
  pacotes: [
    { id: 'pacote_20',  creditos: 20,  valor: 90.00 },
    { id: 'pacote_50',  creditos: 50,  valor: 225.00 },
    { id: 'pacote_100', creditos: 100, valor: 450.00 },
  ],
  permitePersonalizado: true,
} as const;

// Flag para desligar o auto-upgrade com segurança (rollback fácil)
export const AUTO_UPGRADE_ATIVO = false;
```

Garantir que cada plano exponha a franquia (o limite de hoje, apenas com nome de negócio):

```ts
// já deve existir o limite; padronizar o nome de leitura
// PLANOS[plano].atendimentosInclusos  ->  usado como p_franquia na RPC
```

---

## 7. Camada de aplicação

### 7.1 Novo arquivo `lib/creditos.ts` (helpers, mantém o process-message enxuto)

Responsabilidades:

- `getCicloRef(tenant)`: devolve o identificador do ciclo vigente (alinhar com a lógica de ciclo/fechamento atual — usar o mesmo critério de datas já usado hoje).
- `getFranquiaAtual(tenant)`: lê `PLANOS[plano].atendimentosInclusos` de `lib/planos.ts`.
- `consumirAtendimento(tenantId, conversationId)`: monta `ciclo_ref` + `franquia` e chama a RPC `consumir_atendimento` via **service role**. Retorna `{ permitido, origem, saldoFranquia, saldoCreditos }`.
- `getSaldo(tenantId)`: franquia restante + soma de créditos válidos (para dashboard).

### 7.2 Hook em `lib/ai/process-message.ts` (arquivo grande ~2000 linhas — gerar via Python para não truncar)

- **Localizar o ponto exato** onde hoje uma nova conversa faturável é registrada/contada (onde o contador de conversas incrementa hoje). É **exatamente ali** que se chama `consumirAtendimento(...)`. Não criar um segundo ponto de contagem.
- Se `permitido === false`:
  - **Não** rodar o agente para essa nova conversa.
  - Marcar estado de bloqueio no tenant (ex.: `agent_config.atendimento_bloqueado = true`, `bloqueado_em = now()`), para o pipeline dar short-circuit rápido nas próximas mensagens sem bater na RPC toda hora.
  - Disparar notificação ao cliente (seção 9).
- Se `permitido === true`: segue o fluxo normal atual do agente.
- **Conversas já abertas dentro da janela de 24h continuam** (já foram contadas; a idempotência garante que não consomem de novo).

> Importante: manter o **debounce/lock Redis atual intacto**. O consumo/idempotência é no banco (RPC), o Redis continua só para agrupar mensagens e evitar processamento duplicado.

### 7.3 Rotas de API (novas)

- `POST /api/creditos/solicitar` — cliente pede um pacote (20/50/100) ou personalizado. Cria `credito_solicitacoes` (status `pendente`) e notifica a Hubtek. **Não** cria o lote ainda.
- `POST /api/admin/creditos/aprovar` — admin confirma pagamento: cria o lote em `credito_pacotes` (`ativado_em = now()`, `expira_em = now() + 90 dias`), marca a solicitação como `aprovada`, e **limpa o bloqueio** do tenant se houver saldo. Somente `admin_hubtek`.
- `GET /api/creditos/saldo` — saldo de franquia + créditos válidos (para os cards da dashboard).

> Alinha com o billing manual atual (F6-1 ainda pendente). Quando entrar Stripe, o passo de "aprovar" vira o webhook de pagamento; o resto da lógica não muda.

---

## 8. Desligar o auto-upgrade (com cuidado)

- Encontrar onde o auto-upgrade roda hoje (cron e/ou função no fechamento/durante o mês) e **gatear por `AUTO_UPGRADE_ATIVO`**. Não apagar o código; apenas não executá-lo quando a flag for `false`. Isso dá rollback imediato.
- **Clientes atualmente em plano já "upgradado" no mês vigente:** deixar a lógica de reversão do mês seguinte rodar **uma última vez** para eles (ou tratar manualmente na virada). Não ligar o bloqueio para esses tenants antes da virada do ciclo deles, para não travar quem está no meio de um ciclo já upgradado.
- Ajustar a mensagem/estado que antes dizia "seu plano subiu automaticamente" para o novo aviso de escolha (seção 9).

---

## 9. Bloqueio ao atingir o limite (comportamento + avisos)

Quando `permitido === false`:

- **Para o cliente (dono do negócio / tenant):** notificação forte e imediata reutilizando o sistema atual — sino + banner na dashboard + e-mail (Resend) + WhatsApp para o número do responsável. Texto no sentido de: atingiu o limite de atendimentos do plano; para continuar, faça upgrade (fale conosco) ou adicione créditos.
- **Para o contato final (cliente do cliente):** decisão de UX com **default seguro**:
  - **Default recomendado:** o agente **não** responde novas conversas (deixa para atendimento humano / fila), evitando resposta ruim ou "robô sem contexto". 
  - **Opcional (config por tenant):** enviar **uma única** mensagem de cortesia configurável ("estamos em atendimento, já já retornamos"). Deixar desligado por padrão.
- **Limpar o bloqueio** (`atendimento_bloqueado = false`) automaticamente quando: upgrade efetivado, créditos aprovados, **ou** virada de ciclo com franquia renovada.

---

## 10. Virada de mês, expiração e crons

- **Fechamento mensal (cron existente):** ao virar o ciclo, o `ciclo_ref` muda → a franquia usada volta a zero naturalmente (o ledger conta por `ciclo_ref`). **Créditos comprados não resetam.** Limpar `atendimento_bloqueado` se a franquia nova estiver disponível. Registrar o consumo do ciclo em `ciclos_fechados`/relatórios como já é feito.
- **Novo cron diário `expirar-creditos`** (`app/api/cron/expirar-creditos/route.ts` + entrada no `vercel.json`, protegido por `CRON_SECRET`): marca como `expirado` os pacotes com `expira_em < now()` e `status = 'ativo'`. (A RPC já ignora expirados via `expira_em > now()`, mas o cron mantém o `status` correto para relatórios e dashboard.)
- A prioridade da regra de ouro (seção 2.5) é garantida **na própria RPC** — nenhum cron precisa reordenar consumo.

---

## 11. Plano de rollout seguro (há clientes reais — não pode quebrar)

**Fase 0 — Schema aditivo.** Criar tabelas + RPC + índices no Supabase. Nada lê/bloqueia ainda. Impacto zero.

**Fase 1 — Modo sombra (shadow).** Pipeline chama a RPC em paralelo ao contador legado, **sem bloquear**. Logar divergências entre ledger e contador atual por 1 ciclo completo. Objetivo: provar que o ledger conta igual ao sistema atual.

**Fase 2 — Backfill do ciclo vigente.** Popular `atendimento_consumo` (origem `franquia`) com os atendimentos já contados no ciclo atual de cada tenant, respeitando o limite da franquia, para que ao ligar o bloqueio ninguém seja travado nem contado em dobro.

**Fase 3 — Ativar por tenant.** Ligar `AUTO_UPGRADE_ATIVO = false` + bloqueio + UI de créditos, começando pelo **tenant de teste** (`f2c113d5-ae15-4764-a9ff-5e8611c6f665`), depois 1 cliente real, depois todos. 

**Fase 4 — Monitorar + rollback pronto.** Se algo sair errado: `AUTO_UPGRADE_ATIVO = true` e desligar o bloqueio (flag) restaura o comportamento anterior sem perder dados (o ledger continua registrando).

---

## 12. Cenários de teste (validar antes de liberar geral)

1. Iniciante (50): 50 conversas OK; 51ª sem crédito → **bloqueia** + avisa.
2. Compra +20 aprovada → desbloqueia; 51ª–70ª consomem crédito; 71ª → **bloqueia**.
3. Virada de mês com franquia renovada + créditos válidos restantes → consome **franquia primeiro**; créditos só se estourar.
4. Crédito com 90 dias vencidos → deixa de contar; saldo some da dashboard; `status = expirado`.
5. Mesma conversa recebe várias mensagens dentro de 24h → conta **1 só** (idempotência).
6. Duas mensagens simultâneas na conversa nova (corrida) → **não** consome 2 (advisory lock + `unique(conversation_id)`).
7. Múltiplos pacotes válidos com validades diferentes → consome o que **expira primeiro**.
8. Cliente em plano já upgradado no modelo antigo, na transição → não é travado no meio do ciclo.
9. Reset do tenant de teste (limpar `atendimento_consumo`, `credito_pacotes`, `credito_solicitacoes` do tenant além do reset atual).

---

## 13. Arquivos impactados (entregar em um único conjunto, revisando tudo antes)

- **SQL (Supabase):** novas tabelas (4), RPC `consumir_atendimento` (5), índices, políticas RLS (SELECT do próprio tenant; escrita via RPC `security definer`/service role).
- **`lib/planos.ts`:** `CREDITO_EXTRA` + `AUTO_UPGRADE_ATIVO` (6).
- **`lib/creditos.ts`** (novo): helpers de ciclo, franquia, consumo e saldo (7.1).
- **`lib/ai/process-message.ts`** (grande — gerar via Python): hook no ponto de contagem + short-circuit de bloqueio (7.2). **Preservar debounce/lock Redis atual.**
- **Rotas:** `app/api/creditos/solicitar`, `app/api/admin/creditos/aprovar`, `app/api/creditos/saldo` (7.3).
- **Cron:** `app/api/cron/expirar-creditos/route.ts` + `vercel.json` (10).
- **Fechamento mensal:** ajustar para o novo `ciclo_ref` e limpar bloqueio (10). Localizar o cron atual.
- **Auto-upgrade:** localizar e gatear por `AUTO_UPGRADE_ATIVO` (8). Não apagar.
- **Dashboard (cliente):** card de saldo (franquia + créditos + validade), banner de bloqueio, botões de compra (20/50/100) + "Solicitar quantidade".
- **Dashboard (admin):** fila de `credito_solicitacoes` para aprovar/recusar.
- **Notificações:** reutilizar sino/banner/e-mail/WhatsApp existentes.

---

## 14. Princípios de segurança da implementação

- **Aditivo:** nenhuma coluna/tabela existente é apagada; nenhuma funcionalidade anterior é removida (apenas o auto-upgrade é gateado por flag).
- **Um único ponto de contagem:** a RPC é chamada exatamente onde o contador incrementa hoje. Nunca duplicar contagem.
- **Idempotência e atomicidade** garantidas no banco (não confiar só em Redis).
- **`lib/planos.ts` é a fonte única** de valores/limites/pacotes.
- **Rollout faseado com flag de rollback.** Shadow antes de bloquear. Tenant de teste antes de cliente real.
- Antes de qualquer entrega de código: revisar todos os arquivos impactados e entregar em um conjunto só, conferindo imports/variáveis não usados (quebram build Vercel) e contratos de tipo entre arquivos.

---

## 15. Pontos a confirmar antes de codar

1. **Onde exatamente o contador de conversas incrementa hoje** (arquivo/função) — é o ponto de hook.
2. **Onde o auto-upgrade roda hoje** (cron e/ou função) — para gatear pela flag.
3. **Como o ciclo é definido hoje** (data de renovação por tenant? dia fixo?) — para o `ciclo_ref` bater com o fechamento atual.
4. **UX do contato final no bloqueio:** manter silêncio + humano (default) ou ligar a mensagem de cortesia opcional?