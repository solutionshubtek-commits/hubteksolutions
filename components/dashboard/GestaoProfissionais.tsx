'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw, User, Pencil, Check, X } from 'lucide-react'

interface Profissional {
  id: string
  nome: string
  especialidade: string | null
  ativo: boolean
}

interface Props {
  tenantId?: string // quando passado, admin gerencia profissionais deste tenant
}

const inputStyle: React.CSSProperties = {
  borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
  padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%',
  boxSizing: 'border-box',
}

export function GestaoProfissionais({ tenantId }: Props) {
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaEspecialidade, setNovaEspecialidade] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editEspec, setEditEspec] = useState('')
  const [erro, setErro] = useState('')

  function buildUrl(base: string, extraParams?: Record<string, string>) {
    const params = new URLSearchParams(extraParams)
    if (tenantId) params.set('tenant_id', tenantId)
    const query = params.toString()
    return query ? `${base}?${query}` : base
  }

  async function fetchProfissionais() {
    setLoading(true)
    try {
      const res = await fetch(buildUrl('/api/profissionais'))
      if (res.ok) {
        const json = await res.json()
        setProfissionais(json.data ?? [])
      }
    } finally { setLoading(false) }
  }

  useEffect(() => {
    fetchProfissionais()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  async function handleAdicionar() {
    if (!novoNome.trim()) { setErro('Nome obrigatório'); return }
    setSalvando(true); setErro('')
    try {
      const res = await fetch(buildUrl('/api/profissionais'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNome.trim(), especialidade: novaEspecialidade.trim() || null }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setNovoNome(''); setNovaEspecialidade('')
      await fetchProfissionais()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao adicionar')
    } finally { setSalvando(false) }
  }

  async function handleEditar(id: string) {
    if (!editNome.trim()) { setErro('Nome obrigatório'); return }
    setSalvando(true); setErro('')
    try {
      const res = await fetch(buildUrl('/api/profissionais'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nome: editNome.trim(), especialidade: editEspec.trim() || null }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setEditandoId(null)
      await fetchProfissionais()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao editar')
    } finally { setSalvando(false) }
  }

  async function handleToggleAtivo(p: Profissional) {
    await fetch(buildUrl('/api/profissionais'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, ativo: !p.ativo }),
    })
    await fetchProfissionais()
  }

  async function handleExcluir(id: string) {
    if (!confirm('Remover este profissional?')) return
    await fetch(buildUrl(`/api/profissionais`, { id }), { method: 'DELETE' })
    await fetchProfissionais()
  }

  function iniciarEdicao(p: Profissional) {
    setEditandoId(p.id)
    setEditNome(p.nome)
    setEditEspec(p.especialidade ?? '')
    setErro('')
  }

  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <User size={15} style={{ color: '#534AB7' }} />
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Profissionais</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Cadastre os profissionais da equipe. O agente usará esta lista para sugerir e registrar responsáveis nos agendamentos.
      </p>

      {/* Formulário de adição */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Nome do profissional *" value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdicionar()}
          style={{ ...inputStyle, flex: '1 1 160px' }}
        />
        <input
          type="text" placeholder="Especialidade (opcional)" value={novaEspecialidade}
          onChange={e => setNovaEspecialidade(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdicionar()}
          style={{ ...inputStyle, flex: '1 1 160px' }}
        />
        <button
          onClick={handleAdicionar} disabled={salvando || !novoNome.trim()}
          style={{ borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: !novoNome.trim() ? 0.5 : 1, flexShrink: 0 }}>
          {salvando ? <RefreshCw size={14} /> : <Plus size={14} />} Adicionar
        </button>
      </div>

      {erro && <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{erro}</p>}

      {/* Lista */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><RefreshCw size={18} color="var(--text-muted)" /></div>
      ) : profissionais.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          Nenhum profissional cadastrado ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {profissionais.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', opacity: p.ativo ? 1 : 0.5 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(83,74,183,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#534AB7', flexShrink: 0 }}>
                {p.nome.charAt(0).toUpperCase()}
              </div>

              {editandoId === p.id ? (
                <>
                  <input type="text" value={editNome} onChange={e => setEditNome(e.target.value)} style={{ ...inputStyle, flex: '1 1 120px' }} autoFocus />
                  <input type="text" value={editEspec} onChange={e => setEditEspec(e.target.value)} placeholder="Especialidade" style={{ ...inputStyle, flex: '1 1 120px' }} />
                  <button onClick={() => handleEditar(p.id)} style={{ background: 'rgba(34,197,94,0.1)', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#22C55E', display: 'flex', alignItems: 'center' }}>
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditandoId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}>
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.nome}</p>
                    {p.especialidade && <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{p.especialidade}</p>}
                  </div>
                  <button
                    onClick={() => handleToggleAtivo(p)}
                    title={p.ativo ? 'Desativar' : 'Ativar'}
                    style={{ borderRadius: 20, border: 'none', padding: '3px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: p.ativo ? 'rgba(34,197,94,0.1)' : 'rgba(163,163,163,0.1)', color: p.ativo ? '#22C55E' : 'var(--text-muted)', flexShrink: 0 }}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button onClick={() => iniciarEdicao(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleExcluir(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
        Profissionais inativos não aparecem como opção nos novos agendamentos.
      </p>
    </div>
  )
}