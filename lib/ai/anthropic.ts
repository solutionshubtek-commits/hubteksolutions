import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ChatConfig, ChatCompletionResult } from './openai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Mesmo contrato de interface que openAIChatCompletion para failover transparente
export async function anthropicChatCompletion(
  messages: ChatMessage[],
  config: ChatConfig = {}
): Promise<ChatCompletionResult> {
  const systemMessage = messages.find(m => m.role === 'system')
  const chatMessages = messages.filter(m => m.role !== 'system')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: config.maxTokens ?? 1000,
    temperature: config.temperature ?? 0.7,
    system: systemMessage?.content,
    messages: chatMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  })

  const content =
    response.content[0]?.type === 'text' ? response.content[0].text : ''

  return {
    content,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  }
}
