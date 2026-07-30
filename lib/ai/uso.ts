import { createServiceClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/supabase/queries/conversations'

// ─── Precificação ─────────────────────────────────────────────────────────────
//
// Preço de tabela dos provedores, em USD por 1 MILHÃO de tokens.
//
// Substitui a antiga CUSTO_POR_1K de process-message.ts, que tinha um preço por
// PROVEDOR (openai/anthropic) e portanto cobrava toda chamada da OpenAI como se
// fosse gpt-4o. Como as auxiliares rodam em gpt-4o-mini, ~17x mais barato na
// entrada, um valor único por provedor não tinha como servir para os dois.
//
// A tabela antiga usava 0,025 e 0,1 por 1k na coluna "reais" — exatamente 10x o
// preço em dólar do gpt-4o por 1k, ou seja, o valor em USD com a vírgula
// deslocada, não uma conversão. O custo gravado ficava ~1,7x acima do real em
// BRL. Quem precifica a venda é o multiplicador de 3x em valor_cobrado
// (/api/admin/fechar-ciclo); esta tabela é CUSTO, não preço.
//
// Conferir contra as páginas de preço dos provedores ao revisar.
export const PRECO_USD_POR_1M: Record<string, { entrada: number; saida: number }> = {
  'gpt-4o':                 { entrada: 2.50, saida: 10.00 },
  'gpt-4o-mini':            { entrada: 0.15, saida:  0.60 },
  'text-embedding-3-small': { entrada: 0.02, saida:  0    },
  'claude-sonnet-4-6':      { entrada: 3.00, saida: 15.00 },
}

// Mesma taxa usada em /api/admin/fechar-ciclo e nas telas de custo.
export const USD_BRL = 5.8

// `ai_usage.motor_utilizado` guarda o PROVEDOR, não o modelo: admin/custos-ia
// separa os totais com `motor_utilizado === 'openai'`. Gravar o nome do modelo
// ali zeraria os dois lados daquele gráfico em silêncio. Para ter quebra por
// modelo seria preciso uma coluna nova — DDL manual, fora do escopo aqui.
export function provedorDoModelo(modelo: string): 'openai' | 'anthropic' {
  return modelo.startsWith('claude') ? 'anthropic' : 'openai'
}

// Recebe o MODELO (não o provedor) e devolve o custo em reais.
export function calcularCusto(modelo: string, tokensIn: number, tokensOut: number): number {
  const tabela = PRECO_USD_POR_1M[modelo] ?? PRECO_USD_POR_1M['gpt-4o']
  const usd = (tokensIn / 1_000_000) * tabela.entrada + (tokensOut / 1_000_000) * tabela.saida
  return usd * USD_BRL
}

// ─── Registro de consumo ──────────────────────────────────────────────────────

// Contexto necessário para atribuir uma chamada de IA a um tenant/conversa.
// As auxiliares recebem isto como parâmetro OPCIONAL: quando ausente a chamada
// simplesmente não é registrada, e nenhuma delas quebra por falta de contexto.
export interface UsoCtx {
  supabase: ReturnType<typeof createServiceClient>
  tenantId: string
  conversationId: string
}

/**
 * Registra uma chamada de IA em ai_usage.
 *
 * Antes só a resposta do motor principal era contabilizada — uma única chamada
 * a logAiUsage no fim do fluxo. Tudo que rodava em gpt-4o-mini (correção da
 * pergunta, expansão para o RAG, resumo do histórico, extração de perfil,
 * classificação de CRM, detecção de "me chama depois") e também os embeddings
 * saíam de graça nos relatórios, então o custo exibido ficava sistematicamente
 * abaixo do real.
 *
 * Vive em módulo próprio de propósito: process-message.ts importa embeddings.ts
 * e detect-me-chama.ts, que também precisam registrar consumo — deixar isto em
 * process-message.ts criaria import circular.
 *
 * Nunca lança: falha ao registrar consumo não pode derrubar um atendimento.
 */
export async function registrarUso(
  ctx: UsoCtx | undefined,
  modelo: string,
  tokensIn: number,
  tokensOut: number
): Promise<void> {
  if (!ctx || (tokensIn === 0 && tokensOut === 0)) return
  try {
    await logAiUsage(ctx.supabase, {
      tenantId:       ctx.tenantId,
      conversationId: ctx.conversationId,
      tokensIn,
      tokensOut,
      motor:          provedorDoModelo(modelo),
      custoReais:     calcularCusto(modelo, tokensIn, tokensOut),
    })
  } catch (err) {
    console.error(`[uso] falha ao registrar consumo de ${modelo}:`, err)
  }
}
