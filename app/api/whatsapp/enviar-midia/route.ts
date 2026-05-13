import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const conversation_id = formData.get('conversation_id') as string
    const tenant_id = formData.get('tenant_id') as string
    const instance_name = formData.get('instance_name') as string
    const telefone = formData.get('telefone') as string

    if (!file || !conversation_id || !tenant_id || !instance_name || !telefone) {
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

    // 1. Upload para o Storage
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const path = `${tenant_id}/mensagens/${Date.now()}_${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('knowledge-base')
      .upload(path, buffer, { contentType: file.type })

    if (uploadError) {
      return NextResponse.json({ error: 'Erro no upload do arquivo' }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('knowledge-base').getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    // 2. Envia via Evolution API
    const isAudio = file.type.startsWith('audio/')
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')

    let endpoint = 'sendMedia'
    let mediaType = 'document'
    if (isAudio) { endpoint = 'sendWhatsAppAudio'; mediaType = 'audio' }
    else if (isVideo) mediaType = 'video'
    else if (isImage) mediaType = 'image'

    const evoBody = isAudio
      ? { number: telefone, audio: publicUrl }
      : {
          number: telefone,
          mediatype: mediaType,
          media: publicUrl,
          fileName: file.name,
        }

    const evoRes = await fetch(`${EVOLUTION_API_URL}/message/${endpoint}/${instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify(evoBody),
    })

    if (!evoRes.ok) {
      console.error('Erro Evolution enviar mídia:', await evoRes.text())
      return NextResponse.json({ error: 'Erro ao enviar arquivo' }, { status: 500 })
    }

    // 3. Salva no banco
    await supabase.from('messages').insert({
      conversation_id,
      tenant_id,
      origem: 'operador',
      tipo: isAudio ? 'audio' : isVideo ? 'video' : isImage ? 'imagem' : 'documento',
      conteudo: file.name,
      arquivo_url: publicUrl,
    })

    await supabase.from('conversations')
      .update({ ultima_mensagem_em: new Date().toISOString() })
      .eq('id', conversation_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Erro ao enviar mídia:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
