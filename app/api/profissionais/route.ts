import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Resolve qual tenant_id usar:
// - Se vier ?tenant_id= na query E o usuário for admin_hubtek → usa o da query
// - Caso contrário → usa o tenant do usuário logado
async function resolveTenantId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  userRole: string,
  queryTenantId: string | null
): Promise<string | null> {
  if (queryTenantId && userRole === 'admin_hubtek') {
    return queryTenantId
  }
  const { data: userData } = await supabase
    .from('users').select('tenant_id').eq('id', userId).single()
  return userData?.tenant_id ?? null
}

export async function GET(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = await resolveTenantId(
    supabase, user.id, userData.role, searchParams.get('tenant_id')
  )
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('profissionais')
    .select('id, nome, especialidade, ativo, criado_em')
    .eq('tenant_id', tenantId)
    .order('nome', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const roles = ['admin_hubtek', 'admin_tenant', 'self_managed']
  if (!roles.includes(userData.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tenantId = await resolveTenantId(
    supabase, user.id, userData.role, searchParams.get('tenant_id')
  )
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const body = await request.json()
  const { nome, especialidade } = body
  if (!nome?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })

  const { data, error } = await supabase
    .from('profissionais')
    .insert({ tenant_id: tenantId, nome: nome.trim(), especialidade: especialidade?.trim() ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = await resolveTenantId(
    supabase, user.id, userData.role, searchParams.get('tenant_id')
  )
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
  delete updates.tenant_id

  const { data, error } = await supabase
    .from('profissionais')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = await resolveTenantId(
    supabase, user.id, userData.role, searchParams.get('tenant_id')
  )
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const { error } = await supabase
    .from('profissionais')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}