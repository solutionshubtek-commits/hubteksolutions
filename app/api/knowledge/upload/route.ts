import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const tenantId = formData.get('tenant_id') as string | null

    if (!file || !tenantId) {
      return NextResponse.json({ error: 'Arquivo e tenant_id são obrigatórios' }, { status: 400 })
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

    if (file.type === 'text/plain') {
      conteudo = buffer.toString('utf-8')

    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const pdfParse = (await import('pdf-parse')).default
        const parsed = await pdfParse(buffer)
        conteudo = parsed.text ?? ''
      } catch (err) {
        console.error('Erro ao extrair PDF:', err)
        // Continua sem texto — arquivo ainda é salvo
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
    // XLSX: extração de texto não é suportada nesta versão — salva sem conteúdo

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
      // Remove o arquivo do storage se falhou no banco
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
