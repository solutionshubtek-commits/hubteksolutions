import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 120

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']
const LIMITE_IMAGEM = 5 * 1024 * 1024
const LIMITE_DOCUMENTO = 50 * 1024 * 1024
const CHUNK_PALAVRAS = 500
const CHUNK_OVERLAP = 50

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

function chunkText(text: string): string[] {
  const palavras = text.split(/\s+/).filter((p) => p.length > 0)
  if (palavras.length <= CHUNK_PALAVRAS) return [text]

  const chunks: string[] = []
  let inicio = 0

  while (inicio < palavras.length) {
    const fim = Math.min(inicio + CHUNK_PALAVRAS, palavras.length)
    chunks.push(palavras.slice(inicio, fim).join(' '))
    if (fim === palavras.length) break
    inicio += CHUNK_PALAVRAS - CHUNK_OVERLAP
  }

  return chunks
}

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

async function extractXlsxText(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const linhas: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      if (rows.length === 0) continue
      linhas.push(`[Aba: ${sheetName}]`)
      for (const row of rows) {
        const celulas = (row as unknown[])
          .map((c) => String(c ?? '').trim())
          .filter((c) => c.length > 0)
        if (celulas.length > 0) linhas.push(celulas.join(' | '))
      }
      linhas.push('')
    }

    return linhas.join('\n').trim()
  } catch (err) {
    console.error('Erro ao extrair XLSX:', err)
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

    // 2. Extrai conteúdo texto
    let conteudo = ''

    if (isImagem) {
      try {
        const base64 = buffer.toString('base64')
        conteudo = await describeImage(base64, file.type, file.name)
      } catch (err) {
        console.error('Erro ao descrever imagem:', err)
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
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')
    ) {
      conteudo = await extractXlsxText(buffer)
    }

    if (!conteudo.trim()) {
      // Sem texto — salva registro único sem embedding
      const { data: novoArquivo, error: dbError } = await supabase
        .from('knowledge_base')
        .insert({
          tenant_id: tenantId,
          nome_arquivo: file.name,
          tipo: file.type,
          conteudo_texto: null,
          embedding: null,
          tamanho_bytes: file.size,
        })
        .select('id, nome_arquivo, tipo, tamanho_bytes, criado_em')
        .single()

      if (dbError) {
        await supabase.storage.from('knowledge-base').remove([path])
        return NextResponse.json({ error: 'Erro ao registrar arquivo' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        arquivo: novoArquivo,
        texto_extraido: false,
        embedding_gerado: false,
        chunks: 0,
      })
    }

    // 3. Chunking
    const chunks = chunkText(conteudo)

    // 4. Gera embeddings e salva um registro por chunk
    let primeiroArquivo = null
    let embeddingsGerados = 0

    for (let i = 0; i < chunks.length; i++) {
      const chunkTexto = chunks[i]
      let embedding: number[] | null = null

      try {
        embedding = await generateEmbedding(chunkTexto)
        embeddingsGerados++
      } catch (err) {
        console.error(`Erro embedding chunk ${i}:`, err)
      }

      const nomeChunk = chunks.length > 1 ? `${file.name} [parte ${i + 1}/${chunks.length}]` : file.name

      const { data, error: dbError } = await supabase
        .from('knowledge_base')
        .insert({
          tenant_id: tenantId,
          nome_arquivo: nomeChunk,
          tipo: file.type,
          conteudo_texto: chunkTexto,
          embedding: embedding ? JSON.stringify(embedding) : null,
          tamanho_bytes: i === 0 ? file.size : 0,
        })
        .select('id, nome_arquivo, tipo, tamanho_bytes, criado_em')
        .single()

      if (dbError) {
        console.error(`Erro ao salvar chunk ${i}:`, dbError)
        if (i === 0) {
          await supabase.storage.from('knowledge-base').remove([path])
          return NextResponse.json({ error: 'Erro ao registrar arquivo' }, { status: 500 })
        }
        continue
      }

      if (i === 0) primeiroArquivo = data
    }

    return NextResponse.json({
      success: true,
      arquivo: primeiroArquivo,
      texto_extraido: true,
      embedding_gerado: embeddingsGerados > 0,
      chunks: chunks.length,
    })
  } catch (err) {
    console.error('Erro no upload:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
