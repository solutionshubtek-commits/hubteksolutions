'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, MessageSquare, ChevronRight, Clock } from 'lucide-react'
import { ETAPAS_FUNIL, LABELS_ETAPA, LABELS_FUNIL } from '@/lib/crm'

interface CRMLead {
  id: string
  conversation_id: string
  contato_nome: string | null
  contato_telefone: string
  funil_tipo: string
  etapa: string
  etapa_anterior: string | null
  movido_por: string
  resumo: string | null
  criado_em: string
  atualizado_em: string
  conversa_encerrada: boolean
}

interface HistoricoItem {
  id: string
  conversation_id: string
  etapa: string
  funil_tipo: string
  resumo: string | null
  criado_em: string
  atualizado_em: string
}

interface Props {
  lead: CRMLead
  funilAtivo: string
  onClose: () => void
  onMover: (novaEtapa: string) => Promise<void>
}

function getInitials(nome: string | null, telefone: string): string {
  if (nome) return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  return telefone.slice(-2)
}

function formatarData(data: string): string {
  return new Date(data).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export function CRMCardModal({ lead, funilAtivo, onClose, onMover }: Props) {
  const router = useRouter()
  const etapas = ETAPAS_FUNIL[funilAtivo] ?? []
  const labels = LABELS_ETAPA[funilAtivo] ?? {}
  const idxAtual = etapas.indexOf(lead.etapa)
  const etapasFinais = etapas.slice(-2)
  const isEncerrado = etapasFinais.includes(lead.etapa) || lead.conversa_encerrada
  const etapasParaMover = etapas.filter(e => e !== lead.etapa)
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  // Busca histórico CRM do mesmo telefone (outras conversas encerradas)
  useEffect(() => {
    async function fetchHistorico() {
      setCarregandoHistorico(true)
      try {
        const res = await fetch(`/api/crm/historico?telefone=${encodeURIComponent(lead.contato_telefone)}&excluir_id=${lead.id}`)
        if (res.ok) {
          const json = await res.json() as { historico: HistoricoItem[] }
          setHistorico(json.historico ?? [])
        }
      } catch { /* silencioso */ } finally {
        setCarregandoHistorico(false)
      }
    }
    fetchHistorico()
  }, [lead.id, lead.contato_telefone])

  return (
    /*
      Overlay: em mobile ocupa a tela inteira com o modal ancorado na base (sheet),
      em sm+ mantém o comportamento centralizado original.
    */
    <div
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={[
          'w-full overflow-hidden shadow-2xl',
          // Mobile: bottom sheet — sobe da base, raio só no topo
          'sm:max-w-sm sm:rounded-2xl',
          // No mobile empurra para a base da tela
          'mt-auto sm:mt-0',
        ].join(' ')}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          maxHeight: '92dvh',
          overflowY: 'auto',
          // Raio somente nos cantos superiores no mobile; sm+ usa rounded-2xl
          borderRadius: 'var(--radius, 16px) var(--radius, 16px) 0 0',
        }}
        // Previne que o clique no modal feche o overlay
        onClick={e => e.stopPropagation()}
      >
        {/* Alça visual (só mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sticky top-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Detalhes do contato
            </span>
            {lead.conversa_encerrada && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(107,107,107,.15)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Encerrada
              </span>
            )}
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Contato */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: 'rgba(99,102,241,.15)', color: '#818CF8' }}>
              {getInitials(lead.contato_nome, lead.contato_telefone)}
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {lead.contato_nome || 'Sem nome'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {lead.contato_telefone}
              </p>
            </div>
          </div>

          {/* Funil */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Funil:</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', color: '#10B981' }}>
              {LABELS_FUNIL[funilAtivo] ?? funilAtivo}
            </span>
          </div>

          {/* Trilha de etapas — scroll horizontal no mobile para não quebrar layout */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-label)' }}>Etapa atual</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
              {etapas.slice(0, -2).map((e, idx) => (
                <div key={e} className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                    style={{
                      background: e === lead.etapa ? 'rgba(16,185,129,.12)' : idx < idxAtual ? 'rgba(16,185,129,.06)' : 'var(--bg-surface-2)',
                      border: `1px solid ${e === lead.etapa ? 'rgba(16,185,129,.4)' : 'var(--border)'}`,
                      color: e === lead.etapa ? '#10B981' : 'var(--text-muted)',
                    }}>
                    {labels[e] ?? e}
                  </span>
                  {idx < etapas.length - 3 && (
                    <ChevronRight size={10} style={{ color: 'var(--text-label)', flexShrink: 0 }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Resumo */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--text-label)' }}>Resumo da conversa</p>
            <div className="rounded-lg p-3 text-xs leading-relaxed"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {lead.resumo || 'Sem resumo disponível ainda.'}
            </div>
          </div>

          {/* Movido por */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)' }}>
            <span style={{ color: '#10B981' }}>⬡</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {lead.movido_por === 'agente'
                ? 'Etapa atualizada automaticamente pelo agente IA'
                : 'Etapa movida manualmente por um operador'}
            </span>
          </div>

          {/* Mover manualmente — só se conversa ativa e não em etapa final */}
          {!isEncerrado && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-label)' }}>Mover para</p>
              <div className="flex flex-wrap gap-1.5">
                {etapasParaMover.map(e => {
                  const isFinalPos = e === etapas[etapas.length - 2]
                  const isFinalNeg = e === etapas[etapas.length - 1]
                  return (
                    <button key={e} onClick={() => onMover(e)}
                      className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
                      style={{
                        background: isFinalPos ? 'rgba(52,211,153,.1)' : isFinalNeg ? 'rgba(248,113,113,.1)' : 'var(--bg-surface-2)',
                        border: `1px solid ${isFinalPos ? 'rgba(52,211,153,.3)' : isFinalNeg ? 'rgba(248,113,113,.3)' : 'var(--border)'}`,
                        color: isFinalPos ? '#34D399' : isFinalNeg ? '#F87171' : 'var(--text-secondary)',
                      }}>
                      {labels[e] ?? e}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Histórico CRM — negociações anteriores do mesmo telefone */}
          {(historico.length > 0 || carregandoHistorico) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={11} style={{ color: 'var(--text-label)' }} />
                <p className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-label)' }}>Histórico de negociações</p>
              </div>
              {carregandoHistorico ? (
                <div className="h-8 rounded animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
              ) : (
                <div className="space-y-2">
                  {historico.map(h => {
                    const labelsH = LABELS_ETAPA[h.funil_tipo] ?? {}
                    const funilLabel = LABELS_FUNIL[h.funil_tipo] ?? h.funil_tipo
                    return (
                      <div key={h.id} className="rounded-lg p-2.5"
                        style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            {funilLabel}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>
                            {formatarData(h.criado_em).split(',')[0]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            Parou em: {labelsH[h.etapa] ?? h.etapa}
                          </span>
                        </div>
                        {h.resumo && (
                          <p className="text-[10px] mt-1 leading-relaxed line-clamp-2"
                            style={{ color: 'var(--text-label)' }}>
                            {h.resumo}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Info rodapé */}
          <p className="text-[10px]" style={{ color: 'var(--text-label)' }}>
            Entrou em {formatarData(lead.criado_em)} · Atualizado {formatarData(lead.atualizado_em)}
          </p>

          {/* Ações */}
          <div className="flex gap-2 pt-1 pb-safe">
            <button
              onClick={() => { onClose(); router.push(`/conversas/${lead.conversation_id}`) }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold"
              style={{ background: '#10B981', color: '#000' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#059669'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#10B981'}>
              <MessageSquare size={13} />
              Abrir conversa
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-2)'}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}