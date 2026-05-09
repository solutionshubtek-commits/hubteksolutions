import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { tenant_id, instancias } = await request.json()
    // instancias: Array<{ apelido: string }>

    if (!tenant_id || !Array.isArray(instancias) || instancias.length === 0) {
      return NextResponse.json({ error: 'tenant_id e instancias são obrigatórios' }, { status: 400 })
    }

    if (instancias.length > 5) {
      return NextResponse.json({ error: 'Máximo de 5 instâncias por cliente' }, { status: 400 })
    }

    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.hubteksolutions.tech'

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return NextResponse.json({ error: 'Variáveis de ambiente da Evolution API não configuradas' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Busca slug do tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenant_id)
      .single()

    if (!tenant?.slug) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
    }

    // Busca quantas instâncias já existem para numerar corretamente
    const { data: existentes } = await supabase
      .from('tenant_instances')
      .select('id')
      .eq('tenant_id', tenant_id)

    const offsetNumero = existentes?.length ?? 0
    const resultados: { instance_name: string; apelido: string }[] = []
    const erros: { instance_name: string; erro: unknown }[] = []

    for (let i = 0; i < instancias.length; i++) {
      const numero = offsetNumero + i + 1
      const instance_name = `${tenant.slug}_conexao${numero}`
      const apelido = instancias[i].apelido || `Conexão ${numero}`

      try {
        // 1. Criar instância na Evolution API
        const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
          body: JSON.stringify({
            instanceName: instance_name,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        })

        if (!createResponse.ok) {
          const err = await createResponse.json().catch(() => ({}))
          erros.push({ instance_name, erro: err })
          continue
        }

        const instanceData = await createResponse.json()
        const instance_token = instanceData?.hash?.apikey || instanceData?.instance?.token || null

        // 2. Configurar webhook
        await fetch(`${EVOLUTION_API_URL}/webhook/set/${instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: `${APP_URL}/api/webhook/evolution`,
              webhookByEvents: false,
              webhookBase64: false,
              events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            },
          }),
        }).catch(() => console.warn(`Webhook falhou para ${instance_name}`))

        // 3. Salvar em tenant_instances
        const { error: insertError } = await supabase
          .from('tenant_instances')
          .insert({ tenant_id, instance_name, instance_token, apelido })

        if (insertError) {
          erros.push({ instance_name, erro: insertError.message })
        } else {
          resultados.push({ instance_name, apelido })
        }
      } catch (err) {
        erros.push({ instance_name, erro: String(err) })
      }
    }

    return NextResponse.json({ success: resultados.length > 0, criadas: resultados, erros })
  } catch (error) {
    console.error('Erro no onboarding Evolution:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
