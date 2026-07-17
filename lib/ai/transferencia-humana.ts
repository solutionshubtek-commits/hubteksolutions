// lib/ai/transferencia-humana.ts
//
// F7 — Presença de operadores (parte 2/2)
//
// Lógica DETERMINÍSTICA (sem depender do modelo interpretar corretamente) de:
//   1. consultar operadores disponíveis agora (heartbeat + status manual)
//   2. oferecer a escolha ao cliente quando há mais de um
//   3. interpretar a resposta do cliente e concluir a transferência
//   4. cair na fila (comportamento antigo) quando não há ninguém disponível
//      ou o cliente não conseguiu escolher após algumas tentativas
//
// Por que fora do fluxo de tool-calling do LLM: esta decisão precisa
// funcionar igual em qualquer motor (OpenAI ou Anthropic) e não pode falhar
// por o modelo "esquecer" de chamar uma tool — é tratada como regra de
// negócio determinística, no mesmo espírito das travas de CRM e de conflito
// de agendamento já aplicadas neste projeto.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface OperadorDisponivel {
  id: string
  nome: string
}

const JANELA_HEARTBEAT_MIN = 2

// ─── Consulta de disponibilidade ───────────────────────────────────────────

export async function buscarOperadoresDisponiveis(
  supabase: SupabaseClient,
  tenantId: string
): Promise<OperadorDisponivel[]> {
  const limiteHeartbeat = new Date(Date.now() - JANELA_HEARTBEAT_MIN * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('users')
    .select('id, nome')
    .eq('tenant_id', tenantId)
    .eq('role', 'operador')
    .eq('ativo', true)
    .eq('status_atendimento', 'disponivel')
    .gt('ultimo_heartbeat', limiteHeartbeat)
    .order('nome', { ascending: true })

  if (error) {
    console.error('[transferencia-humana] buscarOperadoresDisponiveis falhou:', error)
    return []
  }

  return (data ?? []).map(u => ({ id: u.id as string, nome: (u.nome as string) ?? 'Operador' }))
}

// ─── Formatação da lista para o cliente ────────────────────────────────────

export function formatarListaOperadores(operadores: OperadorDisponivel[]): string {
  return operadores.map((op, i) => `${i + 1}. ${op.nome}`).join('\n')
}

// ─── Interpretação da escolha do cliente ───────────────────────────────────
// Retorna:
//   - o operador escolhido, se identificado com segurança
//   - 'ambiguo' se a mensagem bate com mais de um operador (nome comum)
//   - null se não foi possível identificar nenhuma escolha

export function interpretarEscolhaOperador(
  mensagem: string,
  operadores: OperadorDisponivel[]
): OperadorDisponivel | 'ambiguo' | null {
  const m = mensagem.toLowerCase().trim()

  if (/qualquer|tanto faz|n[aã]o importa|pode ser qualquer/.test(m)) {
    return operadores[0] ?? null
  }

  // Número da lista (1, 2, 3...), tolerando "número 2", "opção 1", etc.
  const numMatch = m.match(/\b([1-9])\b/)
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1
    if (idx >= 0 && idx < operadores.length) return operadores[idx]
  }

  // Nome — compara pelo primeiro nome de cada operador
  const encontrados = operadores.filter(op => {
    const primeiroNome = op.nome.split(' ')[0]?.toLowerCase() ?? ''
    return primeiroNome.length > 1 && m.includes(primeiroNome)
  })
  if (encontrados.length === 1) return encontrados[0]
  if (encontrados.length > 1) return 'ambiguo'

  return null
}

// ─── Início da oferta de escolha ────────────────────────────────────────────
// Grava a lista de candidatos na conversa (transferencia_pendente) para que
// a PRÓXIMA mensagem do cliente seja interpretada como a escolha dele.

export async function iniciarTransferenciaComEscolha(
  supabase: SupabaseClient,
  conversationId: string,
  operadores: OperadorDisponivel[]
): Promise<string> {
  await supabase
    .from('conversations')
    .update({
      transferencia_pendente: { operadores, criado_em: new Date().toISOString() },
      transferencia_tentativas: 0,
    })
    .eq('id', conversationId)

  const lista = formatarListaOperadores(operadores)
  return `Claro! Temos estes atendentes disponíveis agora:\n\n${lista}\n\nPara qual deles você gostaria de ser transferido? Pode responder com o número ou o nome.`
}

// ─── Conclusão da transferência ────────────────────────────────────────────
// Marca a conversa como pausada, atribuída àquele operador especificamente,
// e notifica SÓ ele — diferente da fila (escalarParaHumano), que notifica
// todos os elegíveis do tenant.

export async function confirmarTransferencia(
  supabase: SupabaseClient,
  conversationId: string,
  tenantId: string,
  operador: OperadorDisponivel
): Promise<void> {
  await supabase
    .from('conversations')
    .update({
      agente_pausado: true,
      atendente_id: operador.id,
      atendente_nome: operador.nome,
      pausado_em: new Date().toISOString(),
      transferencia_pendente: null,
      transferencia_tentativas: 0,
    })
    .eq('id', conversationId)

  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('contato_nome, contato_telefone')
      .eq('id', conversationId)
      .single()

    const nomeContato = conv?.contato_nome || conv?.contato_telefone || 'Cliente'

    await supabase.from('notifications').insert({
      user_id: operador.id,
      tenant_id: tenantId,
      tipo: 'atendimento_humano',
      titulo: 'Cliente transferido para você',
      mensagem: `${nomeContato} foi transferido para você.`,
      metadata: { conversation_id: conversationId, contato_nome: nomeContato, motivo: 'transferencia_direta' },
      lida: false,
    })
  } catch (err) {
    console.error('[transferencia-humana] Notificação ao operador falhou (não crítico):', err)
  }
}

// ─── Cancela uma oferta de escolha em aberto ───────────────────────────────
// Usado quando o cliente não consegue escolher após algumas tentativas e o
// atendimento cai na fila comum (escalarParaHumano cuida do resto).

export async function limparTransferenciaPendente(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  await supabase
    .from('conversations')
    .update({ transferencia_pendente: null, transferencia_tentativas: 0 })
    .eq('id', conversationId)
}