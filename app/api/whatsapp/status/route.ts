import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Estado real do socket da instância.
 *
 * `fetchInstances` devolve `connectionStatus`, que é um campo PERSISTIDO no
 * banco da Evolution e só muda quando ela grava uma transição. Quando a sessão
 * cai e a instância entra em reconexão, esse campo continua "open" — foi
 * exatamente o que aconteceu com a Renovar: a tela dizia "Conectado" por dois
 * dias enquanto nenhuma mensagem entrava. `connectionState` consulta o socket,
 * então é ele que responde "está atendendo agora?".
 */
async function estadoRealDaInstancia(instanceName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
      { headers: { apikey: process.env.EVOLUTION_API_KEY! }, cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json() as { instance?: { state?: string } }
    return data?.instance?.state ?? null
  } catch {
    return null
  }
}

// Vocabulário da Evolution → o que gravamos em tenant_instances.status.
// 'connecting' é desconectado de propósito: a instância não entrega mensagem
// enquanto não fecha o pareamento.
const STATUS_DB: Record<string, string> = {
  open: 'conectado',
  close: 'desconectado',
  connecting: 'desconectado',
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tenant_id = searchParams.get('tenant_id')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (!tenant_id) {
      const instanceName = searchParams.get('instance') || 'hubtek'
      const res = await fetch(
        `${process.env.EVOLUTION_API_URL}/instance/fetchInstances`,
        { headers: { apikey: process.env.EVOLUTION_API_KEY! }, cache: 'no-store' }
      )
      const data = await res.json()
      const instancia = Array.isArray(data) ? data.find((i: { name: string }) => i.name === instanceName) : null
      const estadoReal = await estadoRealDaInstancia(instanceName)
      return NextResponse.json({
        status: estadoReal ?? instancia?.connectionStatus ?? 'desconectado',
        numero: instancia?.ownerJid?.replace('@s.whatsapp.net', '') || '',
        nome: instancia?.profileName || '',
      })
    }

    // Busca instâncias do tenant via service role (bypassa RLS)
    const { data: instances, error } = await supabase
      .from('tenant_instances')
      .select('id, instance_name, apelido, status')
      .eq('tenant_id', tenant_id)
      .order('criado_em', { ascending: true })

    if (error) {
      console.error('Erro ao buscar instâncias:', error)
      return NextResponse.json({ instancias: [] })
    }

    if (!instances || instances.length === 0) {
      return NextResponse.json({ instancias: [] })
    }

    // Busca status atualizado da Evolution
    const evolutionRes = await fetch(
      `${process.env.EVOLUTION_API_URL}/instance/fetchInstances`,
      { headers: { apikey: process.env.EVOLUTION_API_KEY! }, cache: 'no-store' }
    )
    const evolutionData = evolutionRes.ok ? await evolutionRes.json() : []

    // Estado real de cada instância, em paralelo.
    const estados = await Promise.all(
      instances.map(inst => estadoRealDaInstancia(inst.instance_name))
    )

    const instancias = instances.map((inst, i) => {
      const ev = Array.isArray(evolutionData)
        ? evolutionData.find((j: { name: string }) => j.name === inst.instance_name)
        : null
      // Instância banida é um estado nosso, derivado do statusReason 401 no
      // connection.update — a Evolution não o reporta de volta. Preservamos.
      const status = inst.status === 'banido'
        ? 'banido'
        : (estados[i] ?? ev?.connectionStatus ?? inst.status ?? 'desconectado')
      return {
        id: inst.id,
        instance_name: inst.instance_name,
        apelido: inst.apelido,
        status,
        numero: ev?.ownerJid?.replace('@s.whatsapp.net', '') || '',
        nome: ev?.profileName || '',
      }
    })

    // Sincroniza o banco com o que o socket respondeu.
    //
    // `tenant_instances.status` só era escrito pelo evento connection.update do
    // webhook. Se a Evolution não emite esse evento — ou se ele se perde — o
    // banco congela no último estado conhecido, e todo alerta construído em
    // cima dele deixa de disparar. Aqui a leitura corrige o registro.
    await Promise.all(
      instancias.map((inst, i) => {
        const novo = inst.status === 'banido' ? 'banido' : STATUS_DB[estados[i] ?? '']
        if (!novo || novo === instances[i].status) return null
        return supabase.from('tenant_instances').update({ status: novo }).eq('id', inst.id)
      }).filter(Boolean)
    )

    return NextResponse.json({ instancias })
  } catch (err) {
    console.error('Erro na API de status:', err)
    return NextResponse.json({ instancias: [] })
  }
}
