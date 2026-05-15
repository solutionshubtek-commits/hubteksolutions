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

    const authHeader = request.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let sent_by_user_id: string | null = null
    let operadorNome: string | null = null
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user?.id) {
        sent_by_user_id = user.id
        const { data: ud } = await supabase.from('users').select('nome').eq('id', user.id).single()
        operadorNome = ud?.nome ?? null
      }
    }

    // Verifica se a conversa está encerrada e reabre se necessário
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, status, contato_nome')
      .eq('id', conversation_id)
      .single()

    const estaEncerrada = conv?.status === 'encerrada' || conv?.status === 'encerrado'
    if (estaEncerrada) {
      await supabase.from('conversations')
        .update({
          status: 'ativa',
          agente_pausado: false,
          ultima_mensagem_em: new Date().toISOString(),
        })
        .eq('id', conversation_id)
    }

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
      sent_by_user_id: sent_by_user_id ?? undefined,
      criado_em: new Date().toISOString(),
    })

    if (insertError) {
      console.error('[enviar-midia-url] Erro ao salvar no banco:', insertError)
    }

    // 3. Atualiza ultima_mensagem_em (se não estava encerrada — evita duplo update)
    if (!estaEncerrada) {
      await supabase.from('conversations')
        .update({ ultima_mensagem_em: new Date().toISOString() })
        .eq('id', conversation_id)
    }

    // 4. Registra log
    if (sent_by_user_id) {
      const contato = conv?.contato_nome ?? telefone
      const tipoLabel = tipo === 'audio' ? 'áudio' : tipo === 'imagem' ? 'imagem' : tipo === 'video' ? 'vídeo' : 'arquivo'
      await supabase.from('conversation_logs').insert({
        tenant_id,
        conversation_id,
        user_id: sent_by_user_id,
        acao: estaEncerrada ? 'reabriu_conversa' : 'enviou_midia',
        descricao: estaEncerrada
          ? `${operadorNome ?? 'Operador'} reabriu e enviou ${tipoLabel} para ${contato}`
          : `${operadorNome ?? 'Operador'} enviou ${tipoLabel} para ${contato}`,
        contato_nome: contato,
      })
    }

    console.log('[enviar-midia-url] Concluído com sucesso')
    return NextResponse.json({ success: true, reaberta: estaEncerrada })

  } catch (err) {
    console.error('[enviar-midia-url] Erro interno:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
