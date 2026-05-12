import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(request: NextRequest) {
  try {
    const { instance_name, tenant_id } = await request.json()

    if (!instance_name || !tenant_id) {
      return NextResponse.json({ error: 'instance_name e tenant_id são obrigatórios' }, { status: 400 })
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

    // 1. Deleta na Evolution API
    const evoRes = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instance_name}`, {
      method: 'DELETE',
      headers: { 'apikey': EVOLUTION_API_KEY },
    })

    // Ignora erro 404 (instância já não existia na Evolution)
    if (!evoRes.ok) {
      const evoData = await evoRes.json().catch(() => ({}))
      const notFound = evoRes.status === 404 || evoData?.error === 'Instance not found'
      if (!notFound) {
        return NextResponse.json({ error: 'Erro ao deletar na Evolution API', detail: evoData }, { status: 500 })
      }
    }

    // 2. Remove do Supabase
    const { error: dbError } = await supabase
      .from('tenant_instances')
      .delete()
      .eq('instance_name', instance_name)
      .eq('tenant_id', tenant_id)

    if (dbError) {
      return NextResponse.json({ error: 'Erro ao remover do banco: ' + dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao deletar instância:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
