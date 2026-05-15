'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, Trash2, RefreshCw, Loader2, Users } from 'lucide-react'

interface Operador {
  id: string
  nome: string
  email: string
  ativo: boolean
  criado_em: string
  senha_provisoria: boolean
}

interface Props {
  tenantId: string
}

export function GestaoOperadores({ tenantId }: Props) {
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [acaoId, setAcaoId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const supabase = createClient()

  const carregarOperadores = useCallback(async () => {
    setCarregando(true)
    const { data } = await supabase
      .from('users')
      .select('id, nome, email, ativo, criado_em, senha_provisoria')
      .eq('tenant_id', tenantId)
      .eq('role', 'operador')
      .eq('ativo', true)
      .order('criado_em', { ascending: true })
    setOperadores(data ?? [])
    setCarregando(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  useEffect(() => { carregarOperadores() }, [carregarOperadores])

  function mostrarSucesso(msg: string) {
    setSucesso(msg); setErro('')
    setTimeout(() => setSucesso(''), 4000)
  }

  function mostrarErro(msg: string) {
    setErro(msg); setSucesso('')
    setTimeout(() => setErro(''), 5000)
  }

  async function adicionarOperador() {
    if (!novoNome.trim() || !novoEmail.trim()) { mostrarErro('Preencha nome e e-mail.'); return }
    if (operadores.length >= 3) { mostrarErro('Limite de 3 operadores atingido.'); return }
    setSalvando(true)
    try {
      const res = await fetch('/api/operadores/convidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: novoEmail, nome: novoNome, tenant_id: tenantId })
      })
      const json = await res.json()
      if (!res.ok) { mostrarErro(json.error ?? 'Erro ao adicionar operador.'); return }
      setNovoNome(''); setNovoEmail('')
      mostrarSucesso('Operador adicionado e e-mail enviado com senha provisória.')
      await carregarOperadores()
    } finally { setSalvando(false) }
  }

  async function removerOperador(id: string) {
    if (!confirm('Remover este operador? O acesso será desativado imediatamente.')) return
    setAcaoId(id)
    try {
      const res = await fetch('/api/operadores/remover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operador_id: id })
      })
      const json = await res.json()
      if (!res.ok) { mostrarErro(json.error ?? 'Erro ao remover.'); return }
      mostrarSucesso('Operador removido.')
      await carregarOperadores()
    } finally { setAcaoId(null) }
  }

  async function reenviarSenha(id: string) {
    setAcaoId(id)
    try {
      const res = await fetch('/api/operadores/reenviar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operador_id: id })
      })
      const json = await res.json()
      if (!res.ok) { mostrarErro(json.error ?? 'Erro ao reenviar.'); return }
      mostrarSucesso('Nova senha provisória enviada por e-mail.')
    } finally { setAcaoId(null) }
  }

  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Operadores</h2>
        <span className="ml-auto text-sm" style={{ color: 'var(--text-muted)' }}>{operadores.length}/3</span>
      </div>

      {erro && (
        <p className="mb-4 text-sm rounded-lg px-3 py-2"
          style={{ color: '#EF4444', background: '#EF444410', border: '1px solid #EF444430' }}>{erro}</p>
      )}
      {sucesso && (
        <p className="mb-4 text-sm rounded-lg px-3 py-2"
          style={{ color: '#10B981', background: '#10B98110', border: '1px solid #10B98130' }}>{sucesso}</p>
      )}

      {operadores.length < 3 && (
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            type="text"
            placeholder="Nome"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <input
            type="email"
            placeholder="E-mail"
            value={novoEmail}
            onChange={e => setNovoEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionarOperador()}
            className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={adicionarOperador}
            disabled={salvando}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
            style={{ background: '#10B981', color: '#fff' }}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Adicionar
          </button>
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : operadores.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Nenhum operador cadastrado.</p>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {operadores.map(op => (
            <div key={op.id} className="flex items-center justify-between py-3 gap-3"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{op.nome}</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{op.email}</p>
                {op.senha_provisoria && (
                  <span className="inline-block mt-1 text-xs rounded px-2 py-0.5"
                    style={{ color: '#F59E0B', background: '#F59E0B10', border: '1px solid #F59E0B30' }}>
                    Aguardando primeiro acesso
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => reenviarSenha(op.id)}
                  disabled={acaoId === op.id}
                  title="Reenviar senha provisória"
                  className="p-2 rounded-lg transition-colors disabled:opacity-40"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {acaoId === op.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => removerOperador(op.id)}
                  disabled={acaoId === op.id}
                  title="Remover operador"
                  className="p-2 rounded-lg transition-colors disabled:opacity-40"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
