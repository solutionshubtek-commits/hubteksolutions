'use client'

import { useEffect, useState } from 'react'
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

  async function carregarOperadores() {
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
  }

  useEffect(() => { carregarOperadores() }, [tenantId])

  function mostrarSucesso(msg: string) {
    setSucesso(msg)
    setErro('')
    setTimeout(() => setSucesso(''), 4000)
  }

  function mostrarErro(msg: string) {
    setErro(msg)
    setSucesso('')
    setTimeout(() => setErro(''), 5000)
  }

  async function adicionarOperador() {
    if (!novoNome.trim() || !novoEmail.trim()) {
      mostrarErro('Preencha nome e e-mail.')
      return
    }
    if (operadores.length >= 3) {
      mostrarErro('Limite de 3 operadores atingido.')
      return
    }
    setSalvando(true)
    try {
      const res = await fetch('/api/operadores/convidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: novoEmail, nome: novoNome, tenant_id: tenantId })
      })
      const json = await res.json()
      if (!res.ok) { mostrarErro(json.error ?? 'Erro ao adicionar operador.'); return }
      setNovoNome('')
      setNovoEmail('')
      mostrarSucesso('Operador adicionado e e-mail enviado com senha provisória.')
      await carregarOperadores()
    } finally {
      setSalvando(false)
    }
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
    } finally {
      setAcaoId(null)
    }
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
    } finally {
      setAcaoId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-gray-500" />
        <h2 className="text-base font-semibold text-gray-900">Operadores</h2>
        <span className="ml-auto text-sm text-gray-400">{operadores.length}/3</span>
      </div>

      {/* Feedback */}
      {erro && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
      {sucesso && <p className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{sucesso}</p>}

      {/* Formulário novo operador */}
      {operadores.length < 3 && (
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            type="text"
            placeholder="Nome"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <input
            type="email"
            placeholder="E-mail"
            value={novoEmail}
            onChange={e => setNovoEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionarOperador()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            onClick={adicionarOperador}
            disabled={salvando}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Adicionar
          </button>
        </div>
      )}

      {/* Lista de operadores */}
      {carregando ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : operadores.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nenhum operador cadastrado.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {operadores.map(op => (
            <div key={op.id} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{op.nome}</p>
                <p className="text-xs text-gray-500 truncate">{op.email}</p>
                {op.senha_provisoria && (
                  <span className="inline-block mt-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                    Aguardando primeiro acesso
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => reenviarSenha(op.id)}
                  disabled={acaoId === op.id}
                  title="Reenviar senha provisória"
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
                >
                  {acaoId === op.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => removerOperador(op.id)}
                  disabled={acaoId === op.id}
                  title="Remover operador"
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
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
