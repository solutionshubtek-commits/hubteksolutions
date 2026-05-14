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
}

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
    model: 'gpt-4o',
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

export async function openAIChatCompletionWithTools(
  messages: ChatMessage[],
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  config: ChatConfig = {}
): Promise<ChatCompletionWithToolsResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools,
    tool_choice: 'auto',
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
