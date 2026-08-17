'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Zap, Check, X, Loader2, Clock, AlertTriangle, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react'
import { CREDITO_EXTRA } from '@/lib/planos'

interface Solicitacao {
  id: string
  tenant_id: string
  tenant_nome: string
  quantidade: number
  valor_total: number
  tipo: string
  status: string
  solicitado_em: string
  aprovado_em: string | null
  pacote_id: string | null
}

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

/**
 * Fila de solicitações de crédito extra.
 *
 * Aprovar aqui LIBERA SALDO de verdade — é o passo que hoje substitui o
 * gateway de pagamento. Por isso a ação pede confirmação e o botão trava
 * enquanto a requisição corre: um duplo clique não pode virar crédito
 * dobrado. A rota também barra isso no banco, mas a tela não deve depender
 * disso para se comportar.
 */
export default function AdminCreditosPage() {
  const [pendentes, setPendentes] = useState<Solicitacao[]>([])
  const [historico, setHistorico] = useState<Solicitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<{ s: Solicitacao; acao: 'aprovar' | 'recusar' } | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/creditos')
      if (!r.ok) throw new Error('Não foi possível carregar a fila')
      const d = await r.json()
      setPendentes(d.pendentes ?? [])
      setHistorico(d.historico ?? [])
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function executar(s: Solicitacao, acao: 'aprovar' | 'recusar') {
    setProcessando(s.id)
    setConfirmando(null)
    setErro(null)
    try {
      const r = await fetch('/api/admin/creditos/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solicitacaoId: s.id, acao }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Falha ao processar')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar')
    } finally {
      setProcessando(null)
    }
  }

  const totalPendente = pendentes.reduce((s, p) => s + Number(p.valor_total), 0)

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Créditos extras
          </h1>
          <p className="text-xs md:text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Aprovar libera o saldo na hora, com validade de {CREDITO_EXTRA.validadeDias} dias.
            Confirme o pagamento antes.
          </p>
        </div>
        <button onClick={() => { setCarregando(true); carregar() }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: '#EF444412', border: '1px solid #EF444430' }}>
          <AlertTriangle size={15} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{erro}</p>
        </div>
      )}

      {pendentes.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg px-3.5 py-3" style={{ background: '#F59E0B12', border: '1px solid #F59E0B30' }}>
          <Clock size={15} color="#F59E0B" />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{pendentes.length}</strong> pedido(s) aguardando
            — {brl(totalPendente)} no total
          </p>
        </div>
      )}

      {/* ── Pendentes ─────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Aguardando confirmação</h2>

        {carregando ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
            ))}
          </div>
        ) : pendentes.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <CheckCircle2 size={20} color="var(--text-label)" className="mx-auto mb-2" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum pedido pendente.</p>
          </div>
        ) : (
          pendentes.map(s => (
            <div key={s.id} className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {s.tenant_nome}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  +{s.quantidade} créditos · <strong>{brl(s.valor_total)}</strong>
                  {s.tipo === 'personalizado' && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
                      personalizado
                    </span>
                  )}
                </p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-label)' }}>
                  Pedido em {dataHora(s.solicitado_em)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setConfirmando({ s, acao: 'recusar' })} disabled={processando === s.id}
                  className="rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <X size={13} /> Recusar
                </button>
                <button onClick={() => setConfirmando({ s, acao: 'aprovar' })} disabled={processando === s.id}
                  className="rounded-lg px-3.5 py-2 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: '#10B981', color: '#fff' }}>
                  {processando === s.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Aprovar
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* ── Histórico ─────────────────────────────────────────────────────── */}
      {historico.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recentes</h2>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {historico.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.tenant_nome}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-label)' }}>
                    +{s.quantidade} · {brl(s.valor_total)} · {s.aprovado_em ? dataHora(s.aprovado_em) : '—'}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-[11px] font-medium whitespace-nowrap"
                  style={{ color: s.status === 'aprovada' ? '#10B981' : '#EF4444' }}>
                  {s.status === 'aprovada' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {s.status === 'aprovada' ? 'Aprovada' : 'Recusada'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Confirmação ───────────────────────────────────────────────────── */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmando(null)}>
          <div className="w-full max-w-sm rounded-xl p-5" onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: confirmando.acao === 'aprovar' ? '#10B98118' : '#EF444418' }}>
                <Zap size={16} color={confirmando.acao === 'aprovar' ? '#10B981' : '#EF4444'} />
              </div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {confirmando.acao === 'aprovar' ? 'Confirmar liberação' : 'Recusar pedido'}
              </h3>
            </div>

            <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
              {confirmando.acao === 'aprovar' ? (
                <>
                  Liberar <strong style={{ color: 'var(--text-primary)' }}>{confirmando.s.quantidade} créditos</strong> para{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{confirmando.s.tenant_nome}</strong>?
                  O saldo passa a valer imediatamente e expira em {CREDITO_EXTRA.validadeDias} dias.
                  Confirme que o pagamento de {brl(confirmando.s.valor_total)} foi recebido.
                </>
              ) : (
                <>
                  Recusar o pedido de {confirmando.s.quantidade} créditos de{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{confirmando.s.tenant_nome}</strong>?
                  O cliente é avisado pelo sino.
                </>
              )}
            </p>

            <div className="flex gap-2">
              <button onClick={() => setConfirmando(null)}
                className="flex-1 rounded-lg py-2 text-xs font-medium"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={() => executar(confirmando.s, confirmando.acao)}
                className="flex-1 rounded-lg py-2 text-xs font-medium"
                style={{ background: confirmando.acao === 'aprovar' ? '#10B981' : '#EF4444', color: '#fff' }}>
                {confirmando.acao === 'aprovar' ? 'Liberar créditos' : 'Recusar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
