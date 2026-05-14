// app/api/notifications/limite-conversas/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PLANOS_MAP } from '@/lib/planos'

const LIMIAR_AVISO = 0.8 // 80%

export async function POST() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Busca tenant do usuário
  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return NextResponse.json({ ok: false })

  const tenantId = userData.tenant_id

  // Busca plano do tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plano')
    .eq('id', tenantId)
    .single()

  const planoKey = (tenant as { plano?: string } | null)?.plano ?? 'essencial'
  const plano = PLANOS_MAP[planoKey]
  if (!plano) return NextResponse.json({ ok: false })

  // Conta conversas do mês atual (UTC-3)
  const agora3 = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const inicioMes = new Date(Date.UTC(agora3.getUTCFullYear(), agora3.getUTCMonth(), 1, 3, 0, 0))

  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('criado_em', inicioMes.toISOString())

  const totalConversas = count ?? 0
  const percentual = totalConversas / plano.limite

  // Retorna dados para o header renderizar o banner
  // Só cria notificação no sininho se ainda não foi criada neste mês
  if (percentual >= LIMIAR_AVISO) {
    const mesRef = `${agora3.getUTCFullYear()}-${String(agora3.getUTCMonth() + 1).padStart(2, '0')}`

    // Verifica se já existe notificação deste tipo neste mês
    const { data: existente } = await supabase
      .from('notifications')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('tipo', 'limite_conversas')
      .gte('criado_em', inicioMes.toISOString())
      .limit(1)

    if (!existente || existente.length === 0) {
      const restantes = plano.limite - totalConversas
      await supabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: user.id,
        tipo: 'limite_conversas',
        titulo: '⚠️ Limite de conversas próximo',
        mensagem: `Você usou ${totalConversas} de ${plano.limite} conversas do plano ${plano.label} este mês. Restam ${restantes} conversa${restantes !== 1 ? 's' : ''}.`,
        lida: false,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    totalConversas,
    limite: plano.limite,
    percentual: Math.round(percentual * 100),
    plano: plano.label,
    emAviso: percentual >= LIMIAR_AVISO,
    atingiuLimite: totalConversas >= plano.limite,
  })
}
