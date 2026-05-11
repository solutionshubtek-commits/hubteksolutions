import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']
const LIMITE_IMAGEM = 5 * 1024 * 1024   // 5MB
const LIMITE_DOCUMENTO = 50 * 1024 * 1024 // 50MB

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

    // 1. Faz upload para o Storage
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

    // 2. Extrai texto conforme o tipo
    let conteudo = ''

    if (isImagem) {
      // Imagens não têm extração de texto — armazenadas para uso via visão no RAG
      conteudo = ''
    } else if (file.type === 'text/plain') {
      conteudo = buffer.toString('utf-8')
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParseModule = await import('pdf-parse') as any
        const pdfParse = pdfParseModule.default ?? pdfParseModule
        const parsed = await pdfParse(buffer)
        conteudo = parsed.text ?? ''
      } catch (err) {
        console.error('Erro ao extrair PDF:', err)
      }
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
    // XLSX: sem extração de texto — salva sem conteúdo

    // 3. Salva registro no banco
    const { data: novoArquivo, error: dbError } = await supabase
      .from('knowledge_base')
      .insert({
        tenant_id: tenantId,
        nome_arquivo: file.name,
        tipo: file.type,
        conteudo_texto: conteudo || null,
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
    })
  } catch (err) {
    console.error('Erro no upload:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
