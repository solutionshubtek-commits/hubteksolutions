import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
}

export interface ChatConfig {
  temperature?: number
  maxTokens?: number
  // Permite rodar chamadas auxiliares (correção ortográfica, resumo de
  // histórico) em um modelo mais barato. As cotas da OpenAI são POR MODELO:
  // o que roda no mini não consome nada do teto do gpt-4o, que é o gargalo
  // do fluxo principal. Ausente = gpt-4o, o comportamento de sempre.
  model?: string
}

// Ferramenta que o modelo é obrigado ou não a chamar. 'required' força uma
// chamada de tool na resposta — só faz sentido quando SABEMOS que uma ação é
// esperada. Ver o comentário em openAIChatCompletionWithTools.
export type ToolChoice = 'auto' | 'required'

export interface ChatCompletionResult {
  content: string
  tokensIn: number
  tokensOut: number
}

export interface ChatCompletionWithToolsResult extends ChatCompletionResult {
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
}

export async function openAIChatCompletion(
  messages: ChatMessage[],
  config: ChatConfig = {}
): Promise<ChatCompletionResult> {
  const response = await openai.chat.completions.create({
    model: config.model ?? 'gpt-4o',
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 1000,
  })
  return {
    content: response.choices[0]?.message?.content ?? '',
    tokensIn: response.usage?.prompt_tokens ?? 0,
    tokensOut: response.usage?.completion_tokens ?? 0,
  }
}

// `toolChoice` passou a ser parâmetro (auditoria 29/07). Antes era 'required'
// fixo, herdado do commit de 28/05 que resolvia o agente prometer uma ação de
// agenda sem executá-la ("um momento, por favor" sem chamar a ferramenta).
//
// O efeito colateral só apareceu quando a ferramenta de transferência passou a
// valer para todo tenant: num tenant de vendas puro, `transferir_atendimento` é
// a ÚNICA ferramenta ativa, e 'required' obrigava o modelo a transferir toda
// mensagem que não fosse saudação — o cliente reclamou que o agente mandava
// tudo para o humano, e a causa era esta linha, não o prompt.
//
// Agora quem chama decide: o fluxo de agenda mantém 'required' onde precisa,
// o resto usa 'auto'. Padrão 'auto' de propósito — forçar é a exceção.
export async function openAIChatCompletionWithTools(
  messages: ChatMessage[],
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  config: ChatConfig = {},
  toolChoice: ToolChoice = 'auto'
): Promise<ChatCompletionWithToolsResult> {
  const response = await openai.chat.completions.create({
    model: config.model ?? 'gpt-4o',
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools,
    tool_choice: toolChoice,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 1000,
  })

  const message = response.choices[0]?.message
  return {
    content: message?.content ?? '',
    tokensIn: response.usage?.prompt_tokens ?? 0,
    tokensOut: response.usage?.completion_tokens ?? 0,
    toolCalls: message?.tool_calls ?? undefined,
  }
}

export async function transcribeAudio(
  base64: string,
  mimetype: string
): Promise<string> {
  const buffer = Buffer.from(base64, 'base64')
  const extension = mimetype.includes('ogg') ? 'ogg' : mimetype.includes('mp4') ? 'mp4' : 'mp3'
  const file = new File([buffer], `audio.${extension}`, { type: mimetype })
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  })
  return transcription.text
}

export async function interpretImage(
  base64: string,
  mimetype: string,
  caption?: string
): Promise<string> {
  const prompt = caption
    ? `Analise esta imagem. Legenda do usuário: "${caption}". Descreva o que vê e interprete a intenção da mensagem.`
    : 'Analise esta imagem e descreva o que vê, interpretando a intenção da mensagem.'
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimetype};base64,${base64}` } },
        ],
      },
    ],
    max_tokens: 500,
  })
  return response.choices[0]?.message?.content ?? ''
}
