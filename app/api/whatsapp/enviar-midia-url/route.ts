import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, tenant_id, instance_name, telefone, arquivo_url, tipo, nome, caption } = await request.json()

    if (!conversation_id || !tenant_id || !instance_name || !telefone || !arquivo_url || !tipo) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
    }

    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Envia via Evolution API
    const isAudio = tipo === 'audio'
    const endpoint = isAudio ? 'sendWhatsAppAudio' : 'sendMedia'
    const mediaType = tipo === 'video' ? 'video' : tipo === 'imagem' ? 'image' : tipo === 'audio' ? 'audio' : 'document'

    const evoBody = isAudio
      ? { number: telefone, audio: arquivo_url }
      : {
          number: telefone,
          mediatype: mediaType,
          media: arquivo_url,
          fileName: nome || 'arquivo',
          caption: caption || undefined,
        }

    console.log('[enviar-midia-url] Chamando Evolution API:', { endpoint, mediaType, telefone })

    const evoRes = await fetch(`${EVOLUTION_API_URL}/message/${endpoint}/${instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify(evoBody),
    })

    const evoText = await evoRes.text()
    console.log('[enviar-midia-url] Evolution API response:', evoRes.status, evoText)

    if (!evoRes.ok) {
      return NextResponse.json({ error: 'Erro ao enviar arquivo' }, { status: 500 })
    }

    // 2. Salva no banco
    const { error: insertError } = await supabase.from('messages').insert({
      conversation_id,
      tenant_id,
      origem: 'operador',
      tipo,
      conteudo: caption || nome || 'arquivo',
      arquivo_url,
      criado_em: new Date().toISOString(),
    })

    if (insertError) {
      console.error('[enviar-midia-url] Erro ao salvar no banco:', insertError)
    }

    await supabase.from('conversations')
      .update({ ultima_mensagem_em: new Date().toISOString() })
      .eq('id', conversation_id)

    console.log('[enviar-midia-url] Concluído com sucesso')
    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[enviar-midia-url] Erro interno:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
