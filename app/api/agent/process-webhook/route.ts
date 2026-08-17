import { NextRequest, NextResponse } from 'next/server'
import {
  aguardarEObterMensagens,
  liberarLock,
  juntarMensagens,
  temMensagensPendentes,
} from '@/lib/ai/debounce'
import { processIncomingMessage } from '@/lib/ai/process-message'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantByInstanceName } from '@/lib/supabase/queries/conversations'
import { PLANOS_MAP, AUTO_UPGRADE_ATIVO } from '@/lib/planos'

// Segredo interno para garantir que só o webhook chama esta rota
const INTERNAL_SECRET = process.env.CRON_SECRET

async function verificarUpgradePlano(tenantId: string): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hubteksolutions.tech'
    await fetch(`${baseUrl}/api/upgrade-plano`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId }),
    })
  } catch (err) {
    console.error('[process-webhook] Erro ao verificar upgrade de plano:', err)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Valida segredo interno
  const secret = request.headers.get('x-internal-secret')
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: {
    tenantId: string
    phone: string
    instanceName: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { tenantId, phone, instanceName } = body

  if (!tenantId || !phone || !instanceName) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  // Só quem realmente adquiriu o lock pode liberá-lo no final. Antes o
  // `finally` rodava incondicionalmente: uma invocação que caiu no `skipped`
  // (porque outra ganhou o lock) apagava os locks de QUEM ESTAVA PROCESSANDO,
  // abrindo espaço para um disparo concorrente e uma resposta duplicada ao
  // cliente no meio do ciclo alheio.
  let lockAdquirido = false

  try {
    // Aguarda janela de debounce e tenta obter lock
    const mensagens = await aguardarEObterMensagens(tenantId, phone)

    // null = outra instância ganhou o lock ou chegou mensagem mais nova
    if (!mensagens || mensagens.length === 0) {
      return NextResponse.json({ skipped: true })
    }

    lockAdquirido = true

    const mensagemUnificada = juntarMensagens(mensagens)
    const pushName = mensagens.find(m => m.pushName)?.pushName

    console.log(`[debounce] ${mensagens.length} msg(s) acumuladas para ${phone} → processando como 1`)

    await processIncomingMessage({
      tenantId,
      instanceName,
      phone,
      pushName,
      messageId: mensagemUnificada.messageId,
      messageKey: mensagemUnificada.messageKey as unknown as Parameters<typeof processIncomingMessage>[0]['messageKey'],
      messageType: mensagemUnificada.tipo as Parameters<typeof processIncomingMessage>[0]['messageType'],
      conteudo: mensagemUnificada.conteudo,
      caption: mensagemUnificada.caption,
    })

    // Verifica upgrade de plano — só enquanto o upgrade automático existir.
    // Com a flag desligada, estourar a franquia bloqueia o atendimento e a
    // escolha passa a ser do cliente (créditos ou upgrade), decidida na RPC
    // de consumo dentro de process-message. Sem este gate, a contagem abaixo
    // rodaria a cada mensagem só para chamar uma rota que responde "desativado".
    const supabase = createServiceClient()
    const tenant = AUTO_UPGRADE_ATIVO
      ? await getTenantByInstanceName(supabase, instanceName)
      : null
    if (tenant) {
      const planoAtual = (tenant as { plano?: string }).plano ?? 'essencial'
      if (planoAtual !== 'elite') {
        const agora3 = new Date(Date.now() - 3 * 60 * 60 * 1000)
        const inicioMes = new Date(Date.UTC(agora3.getUTCFullYear(), agora3.getUTCMonth(), 1, 3, 0, 0))
        const { count } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('criado_em', inicioMes.toISOString())
        const totalConversas = count ?? 0
        const limiteAtual = PLANOS_MAP[planoAtual]?.limite ?? 50
        if (totalConversas >= limiteAtual) {
          verificarUpgradePlano(tenantId)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[process-webhook] Erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  } finally {
    // Sem `return` aqui: um return dentro do finally sobrescreveria a resposta
    // de erro do catch acima e o 500 nunca chegaria a aparecer.
    if (lockAdquirido) {
      await liberarLock(tenantId, phone)

      // Mensagens que o cliente mandou enquanto o agente processava ficaram na
      // fila sem ninguém para disparar o próximo ciclo (o lock de disparo
      // estava tomado). Agora que os locks caíram, refaz o disparo — senão
      // essas mensagens só seriam respondidas se o cliente mandasse ainda
      // outra, e morreriam na expiração da fila caso ele ficasse esperando.
      //
      // Sem risco de laço infinito: o novo ciclo CONSOME a fila
      // (aguardarEObterMensagens faz DEL) e só re-dispara se houver mensagem
      // nova de verdade. Fire-and-forget de propósito — esta função já está no
      // fim do seu orçamento de 60s e não pode esperar o ciclo seguinte.
      try {
        if (await temMensagensPendentes(tenantId, phone)) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hubteksolutions.tech'
          console.log(`[debounce] mensagens acumuladas durante o processamento de ${phone} — redisparando`)
          await fetch(`${baseUrl}/api/agent/process-webhook`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': process.env.CRON_SECRET ?? '',
            },
            body: JSON.stringify({ tenantId, phone, instanceName }),
          }).catch(err => console.error('[debounce] redisparo falhou:', err))
        }
      } catch (err) {
        console.error('[debounce] verificação de pendências falhou:', err)
      }
    }
  }
}