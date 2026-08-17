'use client'
import { useEffect, useState, useCallback } from 'react'
import { Zap, Plus, X, Check, AlertTriangle, Clock, Loader2 } from 'lucide-react'
import { CREDITO_EXTRA, valorCreditosPersonalizado, AUTO_UPGRADE_ATIVO } from '@/lib/planos'

/**
 * A venda de créditos só faz sentido depois que o upgrade automático sai de
 * cena. Enquanto ele estiver ligado, estourar a franquia sobe o plano sozinho
 * e a franquia nova nunca esgota — o crédito comprado ficaria parado até
 * vencer em 90 dias, ou seja, o cliente pagaria por algo que nunca seria
 * consumido. Até lá o card mostra apenas o saldo, que é informação correta e
 * útil. Quando a flag virar `false` (etapa 8), a compra aparece sozinha.
 */
const VENDA_ATIVA = !AUTO_UPGRADE_ATIVO

interface PacoteAtivo {
  id: string
  quantidade_total: number
  quantidade_restante: number
  expira_em: string
  ativado_em: string
}

interface SaldoResposta {
  ciclo: string
  plano: string
  franquiaTotal: number
  franquiaUsada: number
  franquiaRestante: number
  creditosRestantes: number
  totalDisponivel: number
  pacotes: PacoteAtivo[]
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Dias inteiros até a data, nunca negativo. */
function diasAte(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5))
}

/**
 * Card de saldo de atendimentos + compra de créditos extras.
 *
 * Três estados visuais, decididos pelo consumo da franquia: normal, atenção
 * (a partir de 80%) e esgotada. A cor muda junto com o texto porque quem bate
 * o teto precisa entender no primeiro olhar que o atendimento vai parar — não
 * depois de ler um número pequeno num canto.
 */
export default function CardCreditos() {
  const [saldo, setSaldo] = useState<SaldoResposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/creditos/saldo')
      if (!r.ok) throw new Error('Não foi possível carregar o saldo')
      setSaldo(await r.json())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  if (erro) {
    return (
      <div className="rounded-xl p-4 md:p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{erro}</p>
      </div>
    )
  }

  if (!saldo) {
    return <div className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
  }

  const pct = saldo.franquiaTotal > 0
    ? Math.min(100, Math.round((saldo.franquiaUsada / saldo.franquiaTotal) * 100))
    : 0
  const esgotada = saldo.franquiaRestante === 0
  const atencao = !esgotada && pct >= 80

  const cor = esgotada ? '#EF4444' : atencao ? '#F59E0B' : '#10B981'

  // O lote que vence primeiro é o que o cliente precisa ver: é dele que a RPC
  // consome, e é o que ele perde se não usar.
  const proximoAVencer = saldo.pacotes[0]

  return (
    <>
      <div className="rounded-xl p-4 md:p-5 flex flex-col gap-4"
        style={{ background: 'var(--bg-surface)', border: `1px solid ${esgotada || atencao ? `${cor}40` : 'var(--border)'}` }}>

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs md:text-sm" style={{ color: 'var(--text-secondary)' }}>
              Atendimentos do plano
            </p>
            <p className="text-2xl md:text-3xl font-bold mt-1" style={{ color: esgotada || atencao ? cor : 'var(--text-primary)' }}>
              {saldo.franquiaRestante}
              <span className="text-base font-normal ml-1.5" style={{ color: 'var(--text-muted)' }}>
                de {saldo.franquiaTotal} restantes
              </span>
            </p>
          </div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cor}18` }}>
            <Zap size={16} color={cor} />
          </div>
        </div>

        <div>
          <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-2)' }}>
            <div className="h-full transition-all" style={{ width: `${pct}%`, background: cor }} />
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-label)' }}>
            {saldo.franquiaUsada} usados neste ciclo · {pct}%
          </p>
        </div>

        {esgotada && (
          <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: '#EF444412', border: '1px solid #EF444430' }}>
            <AlertTriangle size={15} color="#EF4444" className="flex-shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {saldo.creditosRestantes > 0
                ? <>Franquia do plano esgotada. Os atendimentos seguem usando seus <strong>{saldo.creditosRestantes} crédito(s) extras</strong>.</>
                : VENDA_ATIVA
                  ? <>Franquia do plano esgotada e sem créditos extras. Adicione créditos ou fale conosco sobre upgrade de plano.</>
                  : <>Você atingiu a franquia de atendimentos do plano neste ciclo. Fale conosco para avaliar o upgrade.</>}
            </p>
          </div>
        )}

        {atencao && (
          <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: '#F59E0B12', border: '1px solid #F59E0B30' }}>
            <AlertTriangle size={15} color="#F59E0B" className="flex-shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Você já usou {pct}% dos atendimentos do plano neste ciclo.
            </p>
          </div>
        )}

        {saldo.creditosRestantes > 0 && (
          <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-surface-2)' }}>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {saldo.creditosRestantes} crédito(s) extra(s)
              </p>
              {proximoAVencer && (
                <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <Clock size={10} />
                  {proximoAVencer.quantidade_restante} vence(m) em {diasAte(proximoAVencer.expira_em)} dia(s)
                </p>
              )}
            </div>
            <Zap size={14} color="#8B5CF6" />
          </div>
        )}

        {VENDA_ATIVA && (
          <button
            onClick={() => setModalAberto(true)}
            className="w-full rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-opacity hover:opacity-85"
            style={{ background: esgotada ? cor : 'var(--bg-surface-2)', color: esgotada ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            <Plus size={15} /> Adicionar créditos
          </button>
        )}
      </div>

      {modalAberto && (
        <ModalCompra
          aoFechar={() => setModalAberto(false)}
          aoConcluir={() => { setModalAberto(false); carregar() }}
        />
      )}
    </>
  )
}

/**
 * Modal de pedido. Não cobra nem libera nada: registra a solicitação para a
 * Hubtek confirmar o pagamento. O texto deixa isso explícito para o cliente
 * não ficar esperando o saldo aparecer sozinho.
 */
function ModalCompra({ aoFechar, aoConcluir }: { aoFechar: () => void; aoConcluir: () => void }) {
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [personalizado, setPersonalizado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const qtdPersonalizada = parseInt(personalizado, 10)
  const personalizadoValido = Number.isInteger(qtdPersonalizada) && qtdPersonalizada > 0

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aoFechar])

  async function enviar() {
    setEnviando(true)
    setErro(null)
    try {
      const corpo = selecionado === 'personalizado'
        ? { quantidade: qtdPersonalizada }
        : { pacoteId: selecionado }

      const r = await fetch('/api/creditos/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const dados = await r.json()
      if (!r.ok) throw new Error(dados.error ?? 'Não foi possível enviar o pedido')
      setSucesso(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar')
    } finally {
      setEnviando(false)
    }
  }

  const podeEnviar = selecionado !== null &&
    (selecionado !== 'personalizado' || personalizadoValido) && !enviando

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }} onClick={aoFechar}>
      <div className="w-full max-w-md rounded-xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {sucesso ? 'Pedido enviado' : 'Adicionar créditos'}
          </h2>
          <button onClick={aoFechar} aria-label="Fechar" className="p-1 rounded hover:opacity-70">
            <X size={18} color="var(--text-muted)" />
          </button>
        </div>

        {sucesso ? (
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#10B98118' }}>
              <Check size={22} color="#10B981" />
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Recebemos seu pedido. Assim que o pagamento for confirmado, os créditos
              entram automaticamente e você é avisado por aqui.
            </p>
            <button onClick={aoConcluir}
              className="mt-1 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Cada crédito vale 1 atendimento além da franquia do plano, e vale por{' '}
              {CREDITO_EXTRA.validadeDias} dias. Só são consumidos depois que a franquia do ciclo acaba.
            </p>

            <div className="flex flex-col gap-2">
              {CREDITO_EXTRA.pacotes.map((p) => (
                <button key={p.id} onClick={() => setSelecionado(p.id)}
                  className="flex items-center justify-between rounded-lg px-3.5 py-3 text-left transition-colors"
                  style={{
                    background: selecionado === p.id ? '#8B5CF612' : 'var(--bg-surface-2)',
                    border: `1px solid ${selecionado === p.id ? '#8B5CF6' : 'var(--border)'}`,
                  }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    +{p.creditos} créditos
                  </span>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{brl(p.valor)}</span>
                </button>
              ))}

              {CREDITO_EXTRA.permitePersonalizado && (
                <button onClick={() => setSelecionado('personalizado')}
                  className="flex flex-col gap-2 rounded-lg px-3.5 py-3 text-left transition-colors"
                  style={{
                    background: selecionado === 'personalizado' ? '#8B5CF612' : 'var(--bg-surface-2)',
                    border: `1px solid ${selecionado === 'personalizado' ? '#8B5CF6' : 'var(--border)'}`,
                  }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Outra quantidade
                  </span>
                  {selecionado === 'personalizado' && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input type="number" min={1} value={personalizado} autoFocus
                        onChange={(e) => setPersonalizado(e.target.value)}
                        placeholder="Quantos créditos?"
                        className="flex-1 rounded-md px-2.5 py-1.5 text-sm outline-none"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                      {personalizadoValido && (
                        <span className="text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {brl(valorCreditosPersonalizado(qtdPersonalizada))}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )}
            </div>

            {erro && (
              <p className="text-xs mt-3" style={{ color: '#EF4444' }}>{erro}</p>
            )}

            <button onClick={enviar} disabled={!podeEnviar}
              className="w-full mt-4 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-opacity"
              style={{
                background: podeEnviar ? '#8B5CF6' : 'var(--bg-surface-2)',
                color: podeEnviar ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                cursor: podeEnviar ? 'pointer' : 'not-allowed',
              }}>
              {enviando && <Loader2 size={15} className="animate-spin" />}
              {enviando ? 'Enviando…' : 'Solicitar créditos'}
            </button>

            <p className="text-[11px] mt-2.5 text-center leading-relaxed" style={{ color: 'var(--text-label)' }}>
              O pedido é confirmado pela Hubtek antes de os créditos entrarem.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
