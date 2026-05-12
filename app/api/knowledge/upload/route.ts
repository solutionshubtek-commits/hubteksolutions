import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']
const LIMITE_IMAGEM = 5 * 1024 * 1024    // 5MB
const LIMITE_DOCUMENTO = 50 * 1024 * 1024 // 50MB

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  })
  return response.data[0].embedding
}

async function describeImage(base64: string, mimetype: string, filename: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimetype};base64,${base64}`, detail: 'low' },
          },
          {
            type: 'text',
            text: `Descreva detalhadamente esta imagem para uso como base de conhecimento de um agente de atendimento. Nome do arquivo: ${filename}. Inclua: o que é mostrado, cores, textos visíveis, produtos, preços, promoções ou qualquer informação relevante para atendimento ao cliente.`,
          },
        ],
      },
    ],
  })
  return response.choices[0]?.message?.content ?? ''
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { extractText } = await import('unpdf')
    const uint8Array = new Uint8Array(buffer)
    const { text } = await extractText(uint8Array, { mergePages: true })
    return text ?? ''
  } catch (err) {
    console.error('Erro ao extrair PDF com unpdf:', err)
    return ''
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const tenantId = formData.get('tenant_id') as string | null

    if (!file || !tenantId) {
      return NextResponse.json({ error: 'Arquivo e tenant_id são obrigatórios' }, { status: 400 })
    }

    const isImagem = TIPOS_IMAGEM.includes(file.type)
    const limiteBytes = isImagem ? LIMITE_IMAGEM : LIMITE_DOCUMENTO

    if (file.size > limiteBytes) {
      const limite = isImagem ? '5MB' : '50MB'
      return NextResponse.json({ error: `Arquivo muito grande. Limite: ${limite}` }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Upload para o Storage
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const path = `${tenantId}/${Date.now()}_${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('knowledge-base')
      .upload(path, buffer, { contentType: file.type })

    if (uploadError) {
      console.error('Erro upload storage:', uploadError)
      return NextResponse.json({ error: 'Erro no upload do arquivo' }, { status: 500 })
    }

    // 2. Extrai ou gera conteúdo texto
    let conteudo = ''

    if (isImagem) {
      try {
        const base64 = buffer.toString('base64')
        conteudo = await describeImage(base64, file.type, file.name)
      } catch (err) {
        console.error('Erro ao descrever imagem:', err)
        conteudo = ''
      }
    } else if (file.type === 'text/plain') {
      conteudo = buffer.toString('utf-8')
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      conteudo = await extractPdfText(buffer)
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')
    ) {
      try {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        conteudo = result.value ?? ''
      } catch (err) {
        console.error('Erro ao extrair DOCX:', err)
      }
    }
    // XLSX: sem extração de texto

    // 3. Gera embedding se há conteúdo
    let embedding: number[] | null = null
    if (conteudo.trim().length > 0) {
      try {
        embedding = await generateEmbedding(conteudo)
      } catch (err) {
        console.error('Erro ao gerar embedding:', err)
      }
    }

    // 4. Salva no banco
    const { data: novoArquivo, error: dbError } = await supabase
      .from('knowledge_base')
      .insert({
        tenant_id: tenantId,
        nome_arquivo: file.name,
        tipo: file.type,
        conteudo_texto: conteudo || null,
        embedding: embedding ? JSON.stringify(embedding) : null,
        tamanho_bytes: file.size,
      })
      .select('id, nome_arquivo, tipo, tamanho_bytes, criado_em')
      .single()

    if (dbError) {
      console.error('Erro ao salvar no banco:', dbError)
      await supabase.storage.from('knowledge-base').remove([path])
      return NextResponse.json({ error: 'Erro ao registrar arquivo' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      arquivo: novoArquivo,
      texto_extraido: conteudo.length > 0,
      embedding_gerado: embedding !== null,
    })
  } catch (err) {
    console.error('Erro no upload:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}