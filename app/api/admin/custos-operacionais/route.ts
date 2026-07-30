import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Chaves aceitas. Lista fechada de propósito: a tela grava um conjunto fixo de
// custos, e aceitar chave arbitrária deixaria a tabela virar depósito de lixo
// sem ninguém perceber.
const CHAVES_VALIDAS = [
  'vercel',
  'supabase',
  'vps',
  'dominio',
  'claude_pro',
  'github',
  'resend',
  // Créditos abastecidos nas engines. São custo fixo operacional — dinheiro que
  // sai — e não se confundem com o custo estimado por tokens da ai_usage, que
  // serve para entender consumo por cliente e precificar. Ver 007_*.sql.
  'creditos_openai',
  'creditos_anthropic',
  // Divisor do rateio; guardado junto para não precisar de outra tabela.
  'num_clientes',
] as const

type Chave = (typeof CHAVES_VALIDAS)[number]

function ehChaveValida(k: string): k is Chave {
  return (CHAVES_VALIDAS as readonly string[]).includes(k)
}

// '2026-07' | '2026-07-15' → '2026-07-01'
function normalizarCompetencia(valor: string | null): string | null {
  if (!valor) return null
  const m = /^(\d{4})-(\d{2})/.exec(valor)
  if (!m) return null
  const mes = Number(m[2])
  if (mes < 1 || mes > 12) return null
  return `${m[1]}-${m[2]}-01`
}

async function exigirAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'admin_hubtek') {
    return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }
  return { supabase, userId: user.id }
}

/**
 * GET /api/admin/custos-operacionais?competencia=2026-07
 *
 * Devolve `{ competencia, valores: { chave: number }, herdadoDe }`.
 *
 * Se a competência pedida não tiver nenhuma linha, cai para a competência
 * anterior mais recente e devolve os valores dela com `herdadoDe` preenchido.
 * Sem isso, todo dia 1º a tela abriria zerada e alguém teria que redigitar
 * Vercel, VPS e domínio — que não mudam. Os créditos, que mudam, vêm junto e
 * ficam visivelmente marcados como herdados para serem revisados.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await exigirAdmin()
  if (auth.erro) return auth.erro
  const { supabase } = auth

  const competencia = normalizarCompetencia(request.nextUrl.searchParams.get('competencia'))
  if (!competencia) {
    return NextResponse.json({ error: 'Parâmetro `competencia` inválido (use AAAA-MM)' }, { status: 400 })
  }

  const { data: doMes, error } = await supabase
    .from('custos_operacionais')
    .select('chave, valor')
    .eq('competencia', competencia)

  if (error) {
    console.error('[custos-operacionais] GET falhou:', error)
    return NextResponse.json(
      { error: `Erro ao consultar custos [${error.code ?? 'sem código'}]: ${error.message}` },
      { status: 500 }
    )
  }

  if (doMes && doMes.length > 0) {
    return NextResponse.json({
      competencia,
      valores: Object.fromEntries(doMes.map(r => [r.chave, Number(r.valor)])),
      herdadoDe: null,
    })
  }

  // Nenhuma linha nesta competência — herda da anterior mais recente.
  const { data: anterior } = await supabase
    .from('custos_operacionais')
    .select('competencia')
    .lt('competencia', competencia)
    .order('competencia', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!anterior) {
    return NextResponse.json({ competencia, valores: {}, herdadoDe: null })
  }

  const { data: herdados } = await supabase
    .from('custos_operacionais')
    .select('chave, valor')
    .eq('competencia', anterior.competencia)

  return NextResponse.json({
    competencia,
    valores: Object.fromEntries((herdados ?? []).map(r => [r.chave, Number(r.valor)])),
    herdadoDe: anterior.competencia,
  })
}

/**
 * POST /api/admin/custos-operacionais
 * body: { competencia: '2026-07', valores: { vercel: 98.27, ... } }
 *
 * Upsert por (competencia, chave). Grava apenas as chaves enviadas — o que não
 * vier no corpo permanece como está.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await exigirAdmin()
  if (auth.erro) return auth.erro
  const { supabase, userId } = auth

  let body: { competencia?: string; valores?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const competencia = normalizarCompetencia(body.competencia ?? null)
  if (!competencia) {
    return NextResponse.json({ error: 'Campo `competencia` inválido (use AAAA-MM)' }, { status: 400 })
  }
  if (!body.valores || typeof body.valores !== 'object') {
    return NextResponse.json({ error: 'Campo `valores` obrigatório' }, { status: 400 })
  }

  const linhas: Array<{ competencia: string; chave: string; valor: number; atualizado_em: string; atualizado_por: string }> = []

  for (const [chave, bruto] of Object.entries(body.valores)) {
    if (!ehChaveValida(chave)) {
      return NextResponse.json({ error: `Chave desconhecida: ${chave}` }, { status: 400 })
    }
    const valor = Number(bruto)
    // Rejeita explicitamente em vez de coagir para 0: um NaN silencioso viraria
    // custo zerado no rateio e ninguém notaria até o fechamento não bater.
    if (!Number.isFinite(valor) || valor < 0) {
      return NextResponse.json({ error: `Valor inválido para ${chave}` }, { status: 400 })
    }
    linhas.push({
      competencia,
      chave,
      valor,
      atualizado_em: new Date().toISOString(),
      atualizado_por: userId,
    })
  }

  if (linhas.length === 0) {
    return NextResponse.json({ error: 'Nenhum valor enviado' }, { status: 400 })
  }

  const { error } = await supabase
    .from('custos_operacionais')
    .upsert(linhas, { onConflict: 'competencia,chave' })

  if (error) {
    console.error('[custos-operacionais] POST falhou:', error)
    // Devolve o erro do Postgres em vez de "Erro ao salvar custos". A rota já
    // exige admin_hubtek, então não há exposição indevida — e a mensagem
    // genérica obrigava a caçar o motivo no log da Vercel, transformando um
    // "42501: permission denied" ou "42P01: relation does not exist" em
    // adivinhação. O `code` é o que distingue tabela ausente de RLS bloqueando.
    return NextResponse.json(
      {
        error: `Erro ao salvar custos [${error.code ?? 'sem código'}]: ${error.message}`,
        detalhe: error.details ?? null,
        dica: error.hint ?? null,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, competencia, gravados: linhas.length })
}
