// app/api/scheduled-tasks/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const status = searchParams.get('status')
  const tipo = searchParams.get('tipo')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const offset = (page - 1) * limit

  let query = supabase
    .from('scheduled_tasks')
    .select('*, users!criado_por(nome, email)', { count: 'exact' })
    .eq('tenant_id', userData.tenant_id)
    .order('agendado_para', { ascending: true })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (tipo) query = query.eq('tipo', tipo)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, count })
}

export async function POST(request: Request) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await request.json()
  const {
    instance_name,
    contato_telefone,
    contato_nome,
    mensagem_inicial,
    agendado_para,
    variaveis,
  } = body

  if (!instance_name || !contato_telefone || !contato_nome || !mensagem_inicial || !agendado_para) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  if (new Date(agendado_para) <= new Date()) {
    return NextResponse.json({ error: 'Agendamento deve ser no futuro' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('scheduled_tasks')
    .insert({
      tenant_id: userData.tenant_id,
      instance_name,
      contato_telefone,
      contato_nome,
      tipo: 'me_chama_depois',
      mensagem_inicial,
      variaveis: variaveis ?? {},
      status: 'pendente',
      agendado_para,
      criado_por: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { error } = await supabase
    .from('scheduled_tasks')
    .update({ status: 'cancelado' })
    .eq('id', id)
    .eq('tenant_id', userData.tenant_id)
    .eq('status', 'pendente') // só cancela pendentes

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}