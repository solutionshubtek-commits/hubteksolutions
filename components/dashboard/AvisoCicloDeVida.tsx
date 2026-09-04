import Link from 'next/link'
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react'
import type { MotivoBloqueio } from '@/lib/ciclo-vida'

/**
 * Card de acesso bloqueado, mostrado ao gestor do cliente (admin_tenant /
 * self_managed) enquanto o plano estiver vencido ou a conta suspensa.
 *
 * O banner fino do Header continua existindo para o aviso PRÉVIO (D-7, D-1):
 * ele informa sem atrapalhar. Depois que o acesso cai, informar não basta —
 * o usuário precisa entender por que os botões passaram a recusar a ação, e
 * este card é a resposta a essa pergunta.
 *
 * Ele NÃO cobre a tela: os dados continuam legíveis de propósito. O que está
 * bloqueado é a escrita, e quem bloqueia é o middleware — este card só explica.
 * O operador nunca chega aqui; para ele o middleware desvia para
 * /acesso-expirado antes de qualquer página carregar.
 */
export function AvisoCicloDeVida({
  motivo,
  expiraEm,
  podeRenovar,
}: {
  motivo: MotivoBloqueio
  expiraEm: string | null
  podeRenovar: boolean
}) {
  const expirado = motivo === 'expirado'

  return (
    <div className="px-4 pt-4 md:px-8 md:pt-6">
      <div className="rounded-xl p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.35)' }}>

        <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{ background: '#EF444415', border: '1px solid #EF444430' }}>
          {expirado ? <AlertTriangle size={20} className="text-red-400" /> : <Lock size={20} className="text-red-400" />}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            {expirado ? 'Assinatura vencida' : 'Acesso suspenso'}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {expirado ? (
              <>
                Sua assinatura venceu
                {expiraEm && ` em ${new Date(expiraEm).toLocaleDateString('pt-BR')}`}.
                O atendimento automático está pausado e as movimentações na ferramenta
                (envio de mensagem, CRM, agendamentos) estão bloqueadas até a renovação.
                Seus dados continuam preservados e voltam a funcionar assim que o plano
                for renovado.
              </>
            ) : (
              <>
                O acesso desta conta está suspenso. Nenhum dado foi perdido — fale com a
                Hubtek Solutions para regularizar e liberar a ferramenta novamente.
              </>
            )}
          </p>
        </div>

        {podeRenovar && expirado && (
          <Link href="/renovar-plano"
            className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#10B981' }}>
            <RefreshCw size={15} /> Renovar plano
          </Link>
        )}
      </div>
    </div>
  )
}
