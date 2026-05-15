'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, Trash2, RefreshCw, Loader2, ChevronDown, ChevronUp, Users } from 'lucide-react'

interface Operador {
  id: string
  nome: string
  email: string
  criado_em: string
  senha_provisoria: boolean
}

interface Props {
  tenantId: string
  tenantNome: string
}

export function GestaoOperadoresAdmin({ tenantId, tenantNome }: Props) {
  const [aberto, setAberto] = useState(false)
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [carregando, setCarregando] = useState(false)
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
      .select('id, nome, email, criado_em, senha_provisoria')
      .eq('tenant_id', tenantId)
      .eq('role', 'operador')
      .eq('ativo', true)
      .order('criado_em', { ascending: true })
    setOperadores(data ?? [])
    setCarregando(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  useEffect(() => {
    if (aberto) carregarOperadores()
  }, [aberto, carregarOperadores])

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
      if (!res.ok) { mostrarErro(json.error ?? 'Erro ao adicionar.'); return }
      setNovoNome(''); setNovoEmail('')
      mostrarSucesso('Operador adicionado. E-mail com senha enviado.')
      await carregarOperadores()
    } finally { setSalvando(false) }
  }

  async function removerOperador(id: string) {
    if (!confirm(`Remover este operador de ${tenantNome}?`)) return
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
      mostrarSucesso('Nova senha enviada por e-mail.')
    } finally { setAcaoId(null) }
  }

  const inputStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  return (
    <div className="rounded-xl overflow-hidden mt-4" style={{ border: '1px solid var(--border)' }}>
      {/* Header colapsável */}
      <button
        onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors text-left"
        style={{ background: 'var(--bg-surface-2)' }}
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Operadores</span>
          {operadores.length > 0 && (
            <span className="text-xs rounded-full px-2 py-0.5"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              {operadores.length}/3
            </span>
          )}
        </div>
        {aberto
          ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        }
      </button>

      {aberto && (
        <div className="p-4" style={{ background: 'var(--bg-surface)' }}>
          {erro && (
            <p className="mb-3 text-sm rounded-lg px-3 py-2"
              style={{ color: '#EF4444', background: '#EF444410', border: '1px solid #EF444430' }}>{erro}</p>
          )}
          {sucesso && (
            <p className="mb-3 text-sm rounded-lg px-3 py-2"
              style={{ color: '#10B981', background: '#10B98110', border: '1px solid #10B98130' }}>{sucesso}</p>
          )}

          {operadores.length < 3 && (
            <div className="flex flex-row gap-2 mb-4">
              <input
                type="text"
                placeholder="Nome"
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                className="w-40 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={inputStyle}
              />
              <input
                type="email"
                placeholder="E-mail"
                value={novoEmail}
                onChange={e => setNovoEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adicionarOperador()}
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={inputStyle}
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
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : operadores.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Nenhum operador cadastrado.</p>
          ) : (
            <div>
              {operadores.map(op => (
                <div key={op.id} className="flex items-center justify-between py-2.5 gap-3"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{op.nome}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{op.email}</p>
                    {op.senha_provisoria && (
                      <span className="inline-block mt-0.5 text-xs rounded px-2 py-0.5"
                        style={{ color: '#F59E0B', background: '#F59E0B10', border: '1px solid #F59E0B30' }}>
                        Aguardando primeiro acesso
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => reenviarSenha(op.id)}
                      disabled={acaoId === op.id}
                      title="Reenviar senha"
                      className="p-2 rounded-lg transition-colors disabled:opacity-40"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {acaoId === op.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => removerOperador(op.id)}
                      disabled={acaoId === op.id}
                      title="Remover"
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
      )}
    </div>
  )
}
