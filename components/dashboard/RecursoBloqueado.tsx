'use client'
import { Lock, Check, MessageCircle } from 'lucide-react'
import {
  LABEL_RECURSO, RESUMO_PLANO, planoMinimoParaRecurso, planoLabel,
  WHATSAPP_HUBTEK, type RecursoPlano,
} from '@/lib/planos'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Tela mostrada quando o plano do cliente não libera o recurso.
 *
 * O menu continua levando até aqui de propósito: quem não sabe que o recurso
 * existe nunca pede upgrade. Em vez de um "acesso negado", a tela explica o
 * que o recurso faz e qual plano o libera — cada bloqueio vira conversa
 * comercial, que é o objetivo do modelo novo.
 */
export default function RecursoBloqueado({
  recurso,
  planoAtual,
  beneficios,
}: {
  recurso: RecursoPlano
  planoAtual: string
  /** O que o cliente ganha ao liberar. Frases curtas, no que ele resolve. */
  beneficios: string[]
}) {
  const alvo = planoMinimoParaRecurso(recurso)
  const nomeRecurso = LABEL_RECURSO[recurso]

  const mensagem = encodeURIComponent(
    `Olá! Tenho o plano ${planoLabel(planoAtual)} e quero liberar o ${nomeRecurso}.`
  )

  return (
    <div className="p-4 md:p-8 flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-lg rounded-xl p-6 md:p-8 text-center"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ background: '#8B5CF618' }}>
          <Lock size={20} color="#8B5CF6" />
        </div>

        <h1 className="text-lg md:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {nomeRecurso} não está no seu plano
        </h1>

        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Você está no <strong style={{ color: 'var(--text-primary)' }}>{planoLabel(planoAtual)}</strong>.
          {alvo && <> O {nomeRecurso} entra a partir do <strong style={{ color: 'var(--text-primary)' }}>{alvo.label}</strong>.</>}
        </p>

        {beneficios.length > 0 && (
          <ul className="mt-5 mb-5 flex flex-col gap-2.5 text-left">
            {beneficios.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Check size={15} color="#10B981" className="flex-shrink-0 mt-0.5" />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {alvo && (
          <div className="rounded-lg px-4 py-3 mb-5" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Plano {alvo.label}</p>
            <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {brl(alvo.valor)}
              <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>/mês</span>
            </p>
            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {RESUMO_PLANO[alvo.value]} · {alvo.limite} atendimentos inclusos
            </p>
          </div>
        )}

        <a
          href={`https://wa.me/${WHATSAPP_HUBTEK}?text=${mensagem}`}
          target="_blank" rel="noopener noreferrer"
          className="w-full rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-85"
          style={{ background: '#8B5CF6', color: '#fff' }}>
          <MessageCircle size={15} /> Falar com a Hubtek
        </a>
      </div>
    </div>
  )
}
