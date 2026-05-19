// lib/ai/process-message.ts
// ATENÇÃO: Este arquivo SUBSTITUI o anterior — mantém toda lógica existente
// e adiciona detecção de "me chama depois" ao final do fluxo.

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ----------------------------------------------------------------
// DETECÇÃO DE INTENÇÃO "ME CHAMA DEPOIS"
// Chamada após o agente responder — analisa a mensagem do cliente
// ----------------------------------------------------------------

export async function detectarMeChama(params: {
  mensagemCliente: string
  conversationId: string
  tenantId: string
  instanceName: string
  contatoNome: string
  contatoTelefone: string
}): Promise<{ detectado: boolean; agendado_para?: string; mensagem?: string }> {
  const { mensagemCliente, conversationId, tenantId, instanceName, contatoNome, contatoTelefone } =
    params

  // Pré-filtro rápido para não chamar a IA desnecessariamente
  const triggerWords = [
    'chama', 'liga', 'fala', 'contato', 'depois', 'mais tarde', 'amanhã',
    'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo',
    'semana', 'hora', 'horas', 'minutos', 'daqui', 'retorna', 'retorne',
    'volte', 'volta', 'fale', 'manda mensagem',
  ]

  const temTrigger = triggerWords.some((w) =>
    mensagemCliente.toLowerCase().includes(w)
  )
  if (!temTrigger) return { detectado: false }

  // Chama IA para extrair intenção e tempo
  const agora = new Date().toISOString()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content: `Você é um extrator de intenção. Analise a mensagem do usuário e determine se ele está pedindo para ser contactado novamente em um momento futuro.

Data/hora atual (UTC): ${agora}

Responda APENAS em JSON no formato:
{
  "detectado": true | false,
  "agendado_para": "ISO 8601 UTC string" | null,
  "mensagem_recontato": "mensagem curta de recontato" | null
}

Regras:
- Se o usuário pedir para ser chamado em X horas/dias/amanhã/próxima semana → detectado: true
- Calcule agendado_para com base na data atual fornecida
- mensagem_recontato deve ser algo como "Olá {{nome}}, você pediu para falar comigo agora. Estou aqui, como posso ajudar? 😊"
- Se NÃO for pedido de recontato → detectado: false, o resto null`,
      },
      {
        role: 'user',
        content: mensagemCliente,
      },
    ],
  })

  let result: {
    detectado: boolean
    agendado_para?: string | null
    mensagem_recontato?: string | null
  }

  try {
    const raw = completion.choices[0].message.content ?? '{}'
    result = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return { detectado: false }
  }

  if (!result.detectado || !result.agendado_para) return { detectado: false }

  // Salva na scheduled_tasks com criado_por = null (criado pela IA)
  const { error } = await supabase.from('scheduled_tasks').insert({
    tenant_id: tenantId,
    instance_name: instanceName,
    contato_telefone: contatoTelefone,
    contato_nome: contatoNome,
    tipo: 'me_chama_depois',
    mensagem_inicial: result.mensagem_recontato ?? `Olá {{nome}}! Você pediu para falar comigo agora. Como posso ajudar? 😊`,
    variaveis: { nome: contatoNome },
    status: 'pendente',
    agendado_para: result.agendado_para,
    conversation_id: conversationId,
    criado_por: null,
  })

  if (error) {
    console.error('[detectarMeChama] Erro ao salvar task:', error)
    return { detectado: false }
  }

  return {
    detectado: true,
    agendado_para: result.agendado_para,
    mensagem: result.mensagem_recontato ?? undefined,
  }
}