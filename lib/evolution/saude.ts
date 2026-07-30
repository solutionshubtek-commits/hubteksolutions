import { createServiceClient } from '@/lib/supabase/server'

/**
 * Saúde das instâncias do WhatsApp.
 *
 * O que importa para o atendimento não é a Evolution estar de pé — é cada
 * instância estar pareada e recebendo. As duas coisas falham de forma
 * independente: a API pode responder 200 em tudo enquanto a sessão de um
 * cliente caiu e as mensagens dele deixam de chegar, sem erro em lugar nenhum.
 */

export interface InstanciaFora {
  instance_name: string
  apelido: string | null
  tenant_id: string | null
  tenant_nome: string | null
  estado: string
}

export interface SaudeInstancias {
  total: number
  conectadas: number
  desconectadas: InstanciaFora[]
}

// Único estado em que a instância entrega mensagem. 'connecting' NÃO conta:
// a instância está tentando parear e o cliente não recebe nada nesse meio-tempo.
const ESTADO_SAUDAVEL = 'open'

/**
 * Estado do socket de uma instância.
 *
 * Retorna null quando a consulta falha, para o chamador distinguir "não
 * consegui verificar" de "verifiquei e está fora" — tratar timeout como queda
 * geraria alarme falso a cada oscilação de rede.
 */
export async function estadoDaInstancia(instanceName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
      {
        headers: { apikey: process.env.EVOLUTION_API_KEY! },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const data = await res.json() as { instance?: { state?: string } }
    return data?.instance?.state ?? null
  } catch {
    return null
  }
}

/**
 * Verifica todas as instâncias cadastradas e devolve quais estão fora.
 *
 * A lista de instâncias vem do NOSSO banco, não do fetchInstances: o que
 * interessa é o que prometemos atender. Uma instância que sumiu da Evolution
 * mas continua cadastrada aqui é justamente o caso mais grave, e olhar só para
 * o lado da Evolution o esconderia.
 */
export async function verificarInstancias(): Promise<SaudeInstancias> {
  const supabase = createServiceClient()

  const { data: instancias } = await supabase
    .from('tenant_instances')
    .select('instance_name, apelido, status, tenant_id, tenants(nome)')

  const lista = (instancias ?? []) as unknown as Array<{
    instance_name: string
    apelido: string | null
    status: string | null
    tenant_id: string | null
    tenants: { nome: string } | null
  }>

  if (lista.length === 0) return { total: 0, conectadas: 0, desconectadas: [] }

  const estados = await Promise.all(lista.map(i => estadoDaInstancia(i.instance_name)))

  const desconectadas: InstanciaFora[] = []
  let conectadas = 0

  lista.forEach((inst, i) => {
    const estado = estados[i]
    // Banimento é estado nosso, derivado do statusReason 401 no
    // connection.update — a Evolution não o reporta de volta.
    if (inst.status === 'banido') {
      desconectadas.push({
        instance_name: inst.instance_name,
        apelido: inst.apelido,
        tenant_id: inst.tenant_id,
        tenant_nome: inst.tenants?.nome ?? null,
        estado: 'banido',
      })
      return
    }
    // Falha ao consultar não vira alerta: sem resposta não há o que afirmar.
    if (estado === null) return
    if (estado === ESTADO_SAUDAVEL) { conectadas++; return }
    desconectadas.push({
      instance_name: inst.instance_name,
      apelido: inst.apelido,
      tenant_id: inst.tenant_id,
      tenant_nome: inst.tenants?.nome ?? null,
      estado,
    })
  })

  return { total: lista.length, conectadas, desconectadas }
}
