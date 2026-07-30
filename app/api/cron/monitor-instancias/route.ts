import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verificarInstancias } from '@/lib/evolution/saude'

/**
 * Vigia das instâncias de WhatsApp.
 *
 * Existe por causa de uma falha silenciosa: a instância de um cliente ficou dois
 * dias fora do ar, os clientes dele mandaram mensagem e ninguém foi atendido.
 * Nada quebrou de forma visível — a Evolution respondia, o painel dizia
 * "Operacional", a tela de reconexão dizia "Conectado". A queda só apareceu
 * quando o cliente reclamou.
 *
 * A raiz do problema é a plataforma só saber do estado da conexão quando a
 * Evolution manda `connection.update`. Se esse evento não vem — e não veio —,
 * o registro congela no último estado conhecido e o silêncio passa por normal.
 * Este cron inverte a responsabilidade: em vez de esperar ser avisado, pergunta.
 *
 * Roda a cada 10 minutos e:
 *  1. consulta o socket real de cada instância cadastrada;
 *  2. corrige `tenant_instances.status`;
 *  3. avisa por e-mail na TRANSIÇÃO para fora do ar — uma vez por queda, não a
 *     cada verificação, senão o alerta vira ruído e para de ser lido.
 */

export async function GET(request: NextRequest) {
  // Mesmo esquema dos outros crons do projeto: só o segredo autoriza. A Vercel
  // manda `Authorization: Bearer $CRON_SECRET` sozinha quando a variável existe.
  //
  // Havia aqui um fallback que aceitava a mera presença do header
  // `x-vercel-cron`. Header é texto que qualquer cliente escreve — bastava
  // enviá-lo para disparar o monitor à vontade e ler de volta o nome das
  // instâncias fora do ar.
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabase = createServiceClient()

  try {
    const saude = await verificarInstancias()

    const { data: registros } = await supabase
      .from('tenant_instances')
      .select('id, instance_name, status')

    const statusAtual = new Map((registros ?? []).map(r => [r.instance_name, r.status]))
    const fora = new Set(saude.desconectadas.map(d => d.instance_name))

    // Quem caiu AGORA: estava conectado no banco e o socket diz que não está
    // mais. Só esses geram e-mail.
    const novasQuedas = saude.desconectadas.filter(
      d => statusAtual.get(d.instance_name) === 'conectado'
    )

    // Sincroniza o banco com a realidade — inclusive as que voltaram sozinhas.
    const updates = (registros ?? []).map(r => {
      const caiu = fora.has(r.instance_name)
      const novo = caiu
        ? (saude.desconectadas.find(d => d.instance_name === r.instance_name)?.estado === 'banido'
            ? 'banido'
            : 'desconectado')
        : 'conectado'
      if (novo === r.status) return null
      return supabase.from('tenant_instances').update({ status: novo }).eq('id', r.id)
    }).filter(Boolean)
    await Promise.all(updates)

    if (novasQuedas.length > 0) {
      await alertarQueda(novasQuedas)
    }

    return NextResponse.json({
      verificadas: saude.total,
      conectadas: saude.conectadas,
      fora: saude.desconectadas.length,
      novas_quedas: novasQuedas.map(q => q.instance_name),
    })
  } catch (err) {
    console.error('[monitor-instancias] falhou:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

async function alertarQueda(
  quedas: Array<{ instance_name: string; apelido: string | null; tenant_nome: string | null; estado: string }>
) {
  console.error(
    '[monitor-instancias] QUEDA:',
    quedas.map(q => `${q.tenant_nome ?? '?'}/${q.instance_name}=${q.estado}`).join(' ')
  )

  // Aceita um e-mail ou vários separados por vírgula. Sem o split, "a@x,b@y"
  // seria mandado ao Resend como um endereço só e recusado — o alerta morreria
  // exatamente do jeito que este monitor existe para evitar.
  const destino = (process.env.ALERTA_OPERACAO_EMAIL ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)

  if (destino.length === 0 || !process.env.RESEND_API_KEY) return

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    const linhas = quedas.map(q => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${q.tenant_nome ?? '—'}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;">${q.instance_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${q.estado}</td>
      </tr>`).join('')

    await resend.emails.send({
      from: 'Hubtek Monitoramento <noreply@hubteksolutions.tech>',
      to: destino,
      subject: `[URGENTE] ${quedas.length} instância(s) de WhatsApp fora do ar`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="color:#B91C1C;margin-bottom:4px;">WhatsApp fora do ar</h2>
          <p style="color:#444;line-height:1.6;">
            As instâncias abaixo pararam de receber mensagens. Enquanto estiverem assim,
            os clientes escrevem e <strong>nada chega na plataforma</strong> — não há fila
            nem recuperação do que se perde.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
            <tr style="background:#f5f5f5;">
              <th style="text-align:left;padding:8px 12px;">Cliente</th>
              <th style="text-align:left;padding:8px 12px;">Instância</th>
              <th style="text-align:left;padding:8px 12px;">Estado</th>
            </tr>
            ${linhas}
          </table>
          <p style="color:#444;line-height:1.6;">
            Um restart da instância costuma reconectar sem QR Code. Se voltar para
            "connecting", o cliente precisa ler o QR na tela de Reconexão WhatsApp.
          </p>
          <a href="https://app.hubteksolutions.tech/admin/status"
             style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
            Abrir painel de status
          </a>
        </div>`,
    })
  } catch (err) {
    // O alerta falhar não pode derrubar o monitor — o log acima já registrou.
    console.error('[monitor-instancias] falha ao enviar e-mail:', err)
  }
}
