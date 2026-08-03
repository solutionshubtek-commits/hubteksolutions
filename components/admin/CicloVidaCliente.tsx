'use client'
import { useState } from 'react'
import {
  AlertTriangle, Archive, Ban, Loader2, RotateCcw, Trash2, ShieldAlert,
} from 'lucide-react'
import { RETENCAO_ANOS, statusComercialDe, type StatusComercial } from '@/lib/ciclo-vida'

/**
 * Ações do EIXO 1 — ciclo de vida comercial, no painel admin.
 *
 * Cada estado oferece só a transição que faz sentido a partir dele, para não
 * existir caminho ambíguo: Ativo→[Cancelar], Cancelado→[Arquivar | Reativar],
 * Arquivado→[Expurgar]. Toda ação passa por modal explicando o que acontece
 * com os dados — cancelar e arquivar não apagam nada, expurgar apaga tudo.
 *
 * Substitui o antigo botão "Bloquear acesso", que escrevia `status` direto do
 * navegador sem validar transição nem registrar autoria — e que na prática não
 * tirava ninguém da operação.
 */

export interface TenantCicloVida {
  id: string
  nome: string
  slug: string
  status_comercial?: string | null
  cancelado_em?: string | null
  arquivado_em?: string | null
  conta_demo?: boolean | null
}

interface SimulacaoExpurgo {
  tenant: { nome: string; slug: string }
  elegibilidade: { elegivel: boolean; motivo: string }
  contagens: Record<string, number>
  total_linhas: number
  instancias: string[]
  contas_login: { id: string; email: string }[]
  arquivos: { bucket: string; total: number }[]
}

const ESTADOS: Record<StatusComercial, { label: string; cor: string; descricao: string }> = {
  ativo: {
    label: 'Ativo',
    cor: '#10B981',
    descricao: 'Cliente em operação normal.',
  },
  cancelado: {
    label: 'Cancelado',
    cor: '#EF4444',
    descricao: 'Fora da operação, mas visível aqui para o fechamento de ciclo. Dados preservados.',
  },
  arquivado: {
    label: 'Arquivado',
    cor: '#71717A',
    descricao: `Fora da visão principal. Dados preservados no banco por ${RETENCAO_ANOS} anos.`,
  },
}

export function CicloVidaCliente({ tenant, onAtualizado }: {
  tenant: TenantCicloVida
  onAtualizado: () => void
}) {
  const estado = statusComercialDe(tenant.status_comercial)
  const [acao, setAcao] = useState<StatusComercial | 'expurgo' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [slugDigitado, setSlugDigitado] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [simulacao, setSimulacao] = useState<SimulacaoExpurgo | null>(null)
  const [carregandoSim, setCarregandoSim] = useState(false)

  function abrir(proxima: StatusComercial | 'expurgo') {
    setAcao(proxima); setMotivo(''); setSlugDigitado(''); setErro(''); setSimulacao(null)
    if (proxima === 'expurgo') carregarSimulacao()
  }

  function fechar() {
    if (processando) return
    setAcao(null); setErro(''); setSimulacao(null)
  }

  async function carregarSimulacao() {
    setCarregandoSim(true)
    try {
      const res = await fetch(`/api/admin/expurgar-cliente?tenant_id=${tenant.id}`)
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Falha ao simular o expurgo.'); return }
      setSimulacao(data)
    } catch {
      setErro('Falha de rede ao simular o expurgo.')
    } finally {
      setCarregandoSim(false)
    }
  }

  async function executarTransicao(para: StatusComercial) {
    setProcessando(true); setErro('')
    try {
      const res = await fetch('/api/admin/ciclo-vida-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant.id, para, motivo }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Erro desconhecido.'); return }
      setAcao(null)
      onAtualizado()
    } catch {
      setErro('Falha de rede.')
    } finally {
      setProcessando(false)
    }
  }

  async function executarExpurgo() {
    setProcessando(true); setErro('')
    try {
      const res = await fetch('/api/admin/expurgar-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant.id, confirmar: true, confirmacao_slug: slugDigitado }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Erro desconhecido.'); return }
      setAcao(null)
      onAtualizado()
    } catch {
      setErro('Falha de rede.')
    } finally {
      setProcessando(false)
    }
  }

  const cfg = ESTADOS[estado]
  const botao = 'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50'

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-3" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.cor }} />
          <span className="text-xs font-semibold" style={{ color: cfg.cor }}>Ciclo de vida: {cfg.label}</span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cfg.descricao}</p>
        {tenant.cancelado_em && estado !== 'ativo' && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Cancelado em {new Date(tenant.cancelado_em).toLocaleDateString('pt-BR')}
          </p>
        )}
        {tenant.arquivado_em && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Arquivado em {new Date(tenant.arquivado_em).toLocaleDateString('pt-BR')}
          </p>
        )}
      </div>

      {estado === 'ativo' && (
        <button onClick={() => abrir('cancelado')}
          className={`${botao} bg-red-500/10 border-red-500/30 text-red-400`}>
          <Ban size={14} /> Cancelar cliente
        </button>
      )}

      {estado === 'cancelado' && (
        <>
          <button onClick={() => abrir('arquivado')}
            className={`${botao} border`}
            style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <Archive size={14} /> Arquivar cliente
          </button>
          <button onClick={() => abrir('ativo')}
            className={`${botao} bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]`}>
            <RotateCcw size={14} /> Reativar cliente
          </button>
        </>
      )}

      {/* Conta demo pode ser expurgada em qualquer estado — é a mesma regra de
          elegibilidade que a rota aplica. Exigir que ela percorresse
          cancelado→arquivado (que ainda pede ciclo fechado) só para apagar uma
          conta de teste seria burocracia sobre dado sem valor de auditoria. */}
      {(estado === 'arquivado' || tenant.conta_demo) && (
        <button onClick={() => abrir('expurgo')}
          className={`${botao} bg-red-500/10 border-red-500/30 text-red-400`}>
          <Trash2 size={14} /> Expurgar definitivamente
          {tenant.conta_demo && estado !== 'arquivado' && ' (demo)'}
        </button>
      )}

      {acao && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={fechar} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md rounded-xl p-6 pointer-events-auto max-h-[85vh] overflow-y-auto"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

              {acao === 'expurgo' ? (
                <ConteudoExpurgo
                  simulacao={simulacao} carregando={carregandoSim}
                  slug={tenant.slug} slugDigitado={slugDigitado} setSlugDigitado={setSlugDigitado}
                />
              ) : (
                <ConteudoTransicao para={acao} nome={tenant.nome} motivo={motivo} setMotivo={setMotivo} />
              )}

              {erro && (
                <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-400 text-xs">{erro}</p>
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button onClick={fechar} disabled={processando}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-50"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button
                  onClick={() => acao === 'expurgo' ? executarExpurgo() : executarTransicao(acao)}
                  disabled={
                    processando ||
                    (acao === 'expurgo' && (
                      !simulacao?.elegibilidade.elegivel || slugDigitado.trim() !== tenant.slug
                    ))
                  }
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2 ${
                    acao === 'ativo' ? 'bg-[#10B981] hover:bg-[#059669]' : 'bg-red-600 hover:bg-red-700'
                  }`}>
                  {processando && <Loader2 size={14} className="animate-spin" />}
                  {acao === 'expurgo' ? 'Expurgar' : acao === 'ativo' ? 'Reativar' : acao === 'cancelado' ? 'Cancelar cliente' : 'Arquivar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ConteudoTransicao({ para, nome, motivo, setMotivo }: {
  para: StatusComercial; nome: string; motivo: string; setMotivo: (v: string) => void
}) {
  const textos: Record<StatusComercial, { titulo: string; corpo: string[] }> = {
    cancelado: {
      titulo: `Cancelar ${nome}?`,
      corpo: [
        'O agente é pausado e o cliente sai da operação imediatamente.',
        'Os operadores perdem o acesso à dashboard. O gestor do cliente continua entrando.',
        'O cliente CONTINUA visível aqui, com o selo "Cancelado", para você fechar o ciclo.',
        'Nenhum dado é apagado: conversas, mensagens, consumo de IA e agendamentos ficam intactos.',
      ],
    },
    arquivado: {
      titulo: `Arquivar ${nome}?`,
      corpo: [
        'O cliente sai da visão principal e dos contadores, passando à aba "Arquivados".',
        'Os dados CONTINUAM no banco e seguem consultáveis.',
        `Só depois de ${RETENCAO_ANOS} anos arquivado ele se torna elegível ao expurgo físico.`,
        'Exige que o ciclo já tenha sido fechado.',
      ],
    },
    ativo: {
      titulo: `Reativar ${nome}?`,
      corpo: [
        'O cliente volta à operação normal e reaparece na visão principal.',
        'Os operadores recuperam o acesso.',
        'Se o plano estiver vencido, o agente permanece pausado até a renovação da data.',
      ],
    },
  }
  const t = textos[para]

  return (
    <>
      <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{t.titulo}</h3>
      <ul className="space-y-2 mb-4">
        {t.corpo.map((linha, i) => (
          <li key={i} className="text-xs leading-relaxed flex gap-2" style={{ color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>·</span>{linha}
          </li>
        ))}
      </ul>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        Motivo (opcional, fica registrado no log)
      </label>
      <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
        placeholder="Ex: encerramento de contrato"
        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
        style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
    </>
  )
}

function ConteudoExpurgo({ simulacao, carregando, slug, slugDigitado, setSlugDigitado }: {
  simulacao: SimulacaoExpurgo | null
  carregando: boolean
  slug: string
  slugDigitado: string
  setSlugDigitado: (v: string) => void
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={18} className="text-red-400" />
        <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Expurgo definitivo</h3>
      </div>

      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
        <p className="text-xs text-red-400 leading-relaxed">
          Exclusão FÍSICA e irreversível. Não há backup automático nem desfazer.
          Tudo listado abaixo deixa de existir.
        </p>
      </div>

      {carregando && (
        <div className="flex items-center gap-2 py-6 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Levantando o que será apagado…</span>
        </div>
      )}

      {simulacao && (
        <>
          {/* O motivo aparecia aqui DUAS vezes (no aviso e de novo em cinza
              logo abaixo) e nada dizia que era ele que travava o botão — dava
              a entender que o problema estava no slug digitado. */}
          {simulacao.elegibilidade.elegivel ? (
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              {simulacao.elegibilidade.motivo}
            </p>
          ) : (
            <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertTriangle size={14} className="text-[#F59E0B] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#F59E0B] mb-1">
                  Expurgo bloqueado — o botão permanece desabilitado
                </p>
                <p className="text-xs text-[#F59E0B] leading-relaxed">{simulacao.elegibilidade.motivo}</p>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Contas de teste/demo não esperam a retenção. Para liberar, marque
                  o cliente como conta demo (<span className="font-mono">conta_demo</span>).
                </p>
              </div>
            </div>
          )}

          <div className="rounded-lg overflow-hidden mb-4" style={{ border: '1px solid var(--border)' }}>
            <div className="px-3 py-2 flex justify-between text-xs font-semibold"
              style={{ background: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}>
              <span>Linhas a apagar</span>
              <span className="font-mono">{simulacao.total_linhas}</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {Object.entries(simulacao.contagens)
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([tabela, n]) => (
                  <div key={tabela} className="px-3 py-1.5 flex justify-between text-xs"
                    style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{tabela}</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{n}</span>
                  </div>
                ))}
              {simulacao.total_linhas === 0 && (
                <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Nenhum dado vinculado.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1 mb-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <p>· {simulacao.contas_login.length} conta(s) de login: {simulacao.contas_login.map(c => c.email).join(', ') || '—'}</p>
            <p>· {simulacao.instancias.length} instância(s) WhatsApp: {simulacao.instancias.join(', ') || '—'}</p>
            <p>· {simulacao.arquivos.reduce((s, a) => s + a.total, 0)} arquivo(s) no Storage</p>
          </div>

          {/* Sem elegibilidade o campo nem aparece: digitar o slug certo e ver
              o botão continuar apagado é exatamente o que confundiu no teste. */}
          {simulacao.elegibilidade.elegivel && (
            <>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Para confirmar, digite o slug do cliente: <span className="font-mono text-red-400">{slug}</span>
              </label>
              <input type="text" value={slugDigitado} onChange={e => setSlugDigitado(e.target.value)}
                placeholder={slug} autoComplete="off"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </>
          )}
        </>
      )}
    </>
  )
}
