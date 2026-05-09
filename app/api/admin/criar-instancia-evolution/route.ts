import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { tenant_id, slug, nome } = await request.json()

    if (!tenant_id || !slug || !nome) {
      return NextResponse.json({ error: 'tenant_id, slug e nome são obrigatórios' }, { status: 400 })
    }

    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.hubteksolutions.tech'

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return NextResponse.json({ error: 'Variáveis de ambiente da Evolution API não configuradas' }, { status: 500 })
    }

    // Nome da instância baseado no slug + conexao1
    const instance_name = `${slug}_conexao1`

    // 1. Criar instância na Evolution API
    const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        instanceName: instance_name,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    })

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}))
      console.error('Erro ao criar instância Evolution:', errorData)
      return NextResponse.json(
        { error: 'Falha ao criar instância na Evolution API', details: errorData },
        { status: 502 }
      )
    }

    const instanceData = await createResponse.json()
    const instance_token = instanceData?.hash?.apikey || instanceData?.instance?.token || null

    // 2. Configurar webhook na instância criada
    const webhookResponse = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: `${APP_URL}/api/webhook/evolution`,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        },
      }),
    })

    if (!webhookResponse.ok) {
      console.warn('Instância criada mas webhook falhou — será necessário configurar manualmente')
    }

    // 3. Salvar instance_name e instance_token no Supabase
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        instance_name,
        instance_token,
      })
      .eq('id', tenant_id)

    if (updateError) {
      console.error('Erro ao salvar instância no Supabase:', updateError)
      return NextResponse.json(
        { error: 'Instância criada na Evolution mas falhou ao salvar no banco', details: updateError },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      instance_name,
      instance_token,
      message: 'Instância criada e configurada com sucesso',
    })
  } catch (error) {
    console.error('Erro no onboarding Evolution:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
