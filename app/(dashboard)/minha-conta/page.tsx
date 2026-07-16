// app/(dashboard)/minha-conta/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

const MIN_SENHA = 8

const LABELS_ROLE: Record<string, string> = {
  admin_hubtek: 'Administrador Hubtek',
  admin_tenant: 'Administrador',
  self_managed: 'Gestor',
  operador:     'Operador',
}

interface DadosUsuario {
  nome: string | null
  email: string
  role: string
  empresa: string | null
}

function Skeleton() {
  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Minha conta</h1>
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl animate-pulse"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MinhaContaPage() {
  const [dados, setDados] = useState<DadosUsuario | null>(null)
  const [carregando, setCarregando] = useState(true)

  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrarSenhas, setMostrarSenhas] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: userData } = await supabase
          .from('users')
          .select('nome, email, role, tenant_id')
          .eq('id', user.id)
          .single()

        let empresa: string | null = null
        if (userData?.tenant_id) {
          const { data: tenantData } = await supabase
            .from('tenants').select('nome').eq('id', userData.tenant_id).single()
          empresa = tenantData?.nome ?? null
        }

        setDados({
          nome:    userData?.nome ?? null,
          email:   userData?.email ?? user.email ?? '',
          role:    userData?.role ?? '',
          empresa,
        })
      } catch (err) {
        console.error('[minha-conta] fetchData error:', err)
      } finally {
        setCarregando(false)
      }
    }
    fetchData()
  }, [])

  async function handleAlterarSenha() {
    setErro(''); setSucesso(false)

    if (!senhaAtual) { setErro('Informe sua senha atual.'); return }
    if (novaSenha.length < MIN_SENHA) { setErro(`A nova senha deve ter no mínimo ${MIN_SENHA} caracteres.`); return }
    if (novaSenha !== confirmar) { setErro('A confirmação não confere com a nova senha.'); return }
    if (novaSenha === senhaAtual) { setErro('A nova senha deve ser diferente da atual.'); return }

    setSalvando(true)
    try {
      const res = await fetch('/api/conta/alterar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok || !json.ok) {
        setErro(json.error ?? 'Erro ao alterar a senha.')
        return
      }

      setSucesso(true)
      setSenhaAtual(''); setNovaSenha(''); setConfirmar('')
      setTimeout(() => setSucesso(false), 5000)
    } catch {
      setErro('Erro de rede. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <Skeleton />

  const cardStyle  = { background: 'var(--bg-surface)', border: '1px solid var(--border)' }
  const inputStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
  const inputDisabledStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'not-allowed' }

  const forcaSenha = novaSenha.length === 0 ? null
    : novaSenha.length < MIN_SENHA ? { label: 'Muito curta', cor: '#EF4444' }
    : novaSenha.length < 12 ? { label: 'Razoável', cor: '#F59E0B' }
    : { label: 'Forte', cor: '#10B981' }

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">

        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Minha conta</h1>

        {/* Dados pessoais */}
        <div className="rounded-xl p-6" style={cardStyle}>
          <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Dados de acesso</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Para alterar nome ou e-mail, entre em contato com o gestor da sua conta.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Nome</label>
              <input type="text" value={dados?.nome ?? '—'} disabled
                className="w-full rounded-lg px-4 py-3 text-sm" style={inputDisabledStyle} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>E-mail</label>
              <input type="text" value={dados?.email ?? ''} disabled
                className="w-full rounded-lg px-4 py-3 text-sm" style={inputDisabledStyle} />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Perfil</label>
                <input type="text" value={LABELS_ROLE[dados?.role ?? ''] ?? dados?.role ?? '—'} disabled
                  className="w-full rounded-lg px-4 py-3 text-sm" style={inputDisabledStyle} />
              </div>
              {dados?.empresa && (
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Empresa</label>
                  <input type="text" value={dados.empresa} disabled
                    className="w-full rounded-lg px-4 py-3 text-sm" style={inputDisabledStyle} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alterar senha */}
        <div className="rounded-xl p-6" style={cardStyle}>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={15} style={{ color: '#10B981' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Alterar senha</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Por segurança, confirme sua senha atual antes de definir uma nova.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Senha atual</label>
              <input
                type={mostrarSenhas ? 'text' : 'password'}
                value={senhaAtual}
                onChange={e => setSenhaAtual(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
                Nova senha
              </label>
              <div className="relative">
                <input
                  type={mostrarSenhas ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder={`Mínimo ${MIN_SENHA} caracteres`}
                  autoComplete="new-password"
                  className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none pr-10"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenhas(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={mostrarSenhas ? 'Ocultar senhas' : 'Mostrar senhas'}
                >
                  {mostrarSenhas ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {forcaSenha && (
                <p className="text-xs mt-1.5" style={{ color: forcaSenha.cor }}>
                  {forcaSenha.label}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Confirmar nova senha</label>
              <input
                type={mostrarSenhas ? 'text' : 'password'}
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !salvando && handleAlterarSenha()}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>

            {erro && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{erro}</p>
              </div>
            )}
            {sucesso && (
              <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[#10B981] flex-shrink-0" />
                <p className="text-[#10B981] text-sm">Senha alterada com sucesso!</p>
              </div>
            )}

            <button
              onClick={handleAlterarSenha}
              disabled={salvando || !senhaAtual || !novaSenha || !confirmar}
              className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200"
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {salvando ? 'Alterando...' : 'Alterar senha'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}