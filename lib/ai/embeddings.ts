import { openaiClient as openai } from './openai'
import { registrarUso, type UsoCtx } from './uso'

export const MODELO_EMBEDDING = 'text-embedding-3-small'

// text-embedding-3-small → 1536 dimensões, compatível com vector(1536) no schema
//
// `ctx` é opcional: quando informado, o consumo é registrado em ai_usage. Cada
// mensagem do cliente gera pelo menos um embedding para a busca no RAG, e esse
// custo não aparecia em relatório nenhum. É barato por chamada (US$ 0,02 por
// 1M tokens de entrada, sem saída), mas some do total por ser frequente.
export async function generateEmbedding(text: string, ctx?: UsoCtx): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: MODELO_EMBEDDING,
    input: text.slice(0, 8000),
  })

  await registrarUso(ctx, MODELO_EMBEDDING, response.usage?.prompt_tokens ?? 0, 0)

  return response.data[0].embedding
}
