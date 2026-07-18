import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 120

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']
// Funções serverless da Vercel têm teto de 4,5MB no body da requisição. Um limite
// maior aqui é inalcançável: o arquivo é rejeitado pela plataforma antes de chegar
// nesta rota, e o usuário recebia um erro genérico sem relação com o tamanho.
const LIMITE_IMAGEM = 4 * 1024 * 1024
const LIMITE_DOCUMENTO = 4 * 1024 * 1024
const CHUNK_PALAVRAS = 300
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

// As funções de extração propagam o erro em vez de devolver string vazia: quem
// chama precisa distinguir "arquivo sem texto" de "falha ao ler o arquivo".
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf')
  const uint8Array = new Uint8Array(buffer)
  const { text } = await extractText(uint8Array, { mergePages: true })
  return text ?? ''
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
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
}

export async function POST(request: NextRequest) {
  try {
    // Sem esta checagem qualquer requisição poderia injetar documentos na base
    // de qualquer cliente — e a base alimenta as respostas do agente.
    // getUser revalida o token no Supabase; getSession apenas decodifica o
    // cookie e nao serve como barreira de seguranca no servidor.
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: usuarioLogado } = await supabaseAuth
      .from('users')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()

    if (!usuarioLogado) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const tenantIdInformado = formData.get('tenant_id') as string | null

    // admin_hubtek envia para qualquer tenant; os demais ficam restritos ao próprio,
    // independentemente do que vier no FormData.
    const tenantId =
      usuarioLogado.role === 'admin_hubtek'
        ? (tenantIdInformado ?? usuarioLogado.tenant_id)
        : usuarioLogado.tenant_id

    if (!file) {
      return NextResponse.json({ error: 'Arquivo é obrigatório' }, { status: 400 })
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não definido para este usuário' }, { status: 400 })
    }

    const isImagem = TIPOS_IMAGEM.includes(file.type)
    const limiteBytes = isImagem ? LIMITE_IMAGEM : LIMITE_DOCUMENTO

    if (file.size > limiteBytes) {
      const limite = `${Math.round(limiteBytes / 1024 / 1024)}MB`
      return NextResponse.json({ error: `Arquivo muito grande. Limite: ${limite}` }, { status: 400 })
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

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

    let conteudo = ''
    let falhaExtracao: string | null = null

    try {
      if (isImagem) {
        conteudo = await describeImage(buffer.toString('base64'), file.type, file.name)
      } else if (file.type === 'text/plain') {
        conteudo = buffer.toString('utf-8')
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        conteudo = await extractPdfText(buffer)
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.endsWith('.docx')
      ) {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        conteudo = result.value ?? ''
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls')
      ) {
        conteudo = await extractXlsxText(buffer)
      } else {
        falhaExtracao = `formato não suportado para leitura de texto (${file.type || 'tipo desconhecido'})`
      }
    } catch (err) {
      falhaExtracao = err instanceof Error ? err.message : String(err)
      console.error('Erro ao extrair conteúdo do arquivo:', err)
    }

    // Sem texto o arquivo é invisível para a busca semântica: o agente nunca o
    // encontraria. Registrar como sucesso daria a impressão de que o documento
    // está treinado. Desfaz o upload e explica o motivo real.
    if (!conteudo.trim()) {
      await supabase.storage.from('knowledge-base').remove([path])
      const motivo = falhaExtracao
        ? `Não foi possível ler o arquivo: ${falhaExtracao}`
        : isImagem
          ? 'Não foi possível gerar uma descrição desta imagem.'
          : 'Nenhum texto foi encontrado no arquivo. Se for um PDF digitalizado (imagem), converta-o para texto antes de enviar.'
      return NextResponse.json({ error: motivo }, { status: 422 })
    }

    const chunks = chunkText(conteudo)
    let primeiroArquivo = null
    let embeddingsGerados = 0
    let chunksPerdidos = 0
    let ultimoErroEmbedding: string | null = null
    const idsSalvos: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const chunkTexto = chunks[i]
      let embedding: number[] | null = null

      try {
        embedding = await generateEmbedding(chunkTexto)
        embeddingsGerados++
      } catch (err) {
        ultimoErroEmbedding = err instanceof Error ? err.message : String(err)
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
        chunksPerdidos++
        continue
      }

      idsSalvos.push(data.id)
      if (i === 0) primeiroArquivo = data
    }

    // Nenhum embedding gerado = documento inalcançável pela busca semântica.
    // Desfaz tudo: é preferível a um "sucesso" que não treina o agente.
    if (embeddingsGerados === 0) {
      await supabase.storage.from('knowledge-base').remove([path])
      if (idsSalvos.length > 0) {
        await supabase.from('knowledge_base').delete().in('id', idsSalvos)
      }
      return NextResponse.json(
        {
          error: 'O arquivo foi lido, mas não foi possível gerar os embeddings — sem eles o agente não consegue consultar o documento. Verifique a chave da OpenAI.',
          detalhe: ultimoErroEmbedding,
        },
        { status: 502 }
      )
    }

    // Sucesso parcial ainda é útil, mas precisa ser visível.
    const avisos: string[] = []
    if (embeddingsGerados < chunks.length) {
      avisos.push(
        `${chunks.length - embeddingsGerados} de ${chunks.length} trechos ficaram sem embedding e não serão encontrados pelo agente.`
      )
    }
    if (chunksPerdidos > 0) {
      avisos.push(`${chunksPerdidos} trecho(s) não puderam ser salvos no banco.`)
    }

    return NextResponse.json({
      success: true,
      arquivo: primeiroArquivo,
      texto_extraido: true,
      embedding_gerado: embeddingsGerados > 0,
      chunks: chunks.length,
      chunks_com_embedding: embeddingsGerados,
      avisos,
    })
  } catch (err) {
    console.error('Erro no upload:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
