import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
      return NextResponse.json({
        status: instancia?.connectionStatus || 'desconectado',
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

    const instancias = instances.map(inst => {
      const ev = Array.isArray(evolutionData)
        ? evolutionData.find((i: { name: string }) => i.name === inst.instance_name)
        : null
      return {
        id: inst.id,
        instance_name: inst.instance_name,
        apelido: inst.apelido,
        status: ev?.connectionStatus || inst.status || 'desconectado',
        numero: ev?.ownerJid?.replace('@s.whatsapp.net', '') || '',
        nome: ev?.profileName || '',
      }
    })

    return NextResponse.json({ instancias })
  } catch (err) {
    console.error('Erro na API de status:', err)
    return NextResponse.json({ instancias: [] })
  }
}
