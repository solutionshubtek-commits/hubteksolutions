'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'
import Image from 'next/image'

export default function TrocarSenhaPage() {
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleTrocar() {
    setErro('')
    if (senha.length < 8) { setErro('A senha deve ter no mínimo 8 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }

    setSalvando(true)
    try {
      const { error: authError } = await supabase.auth.updateUser({ password: senha })
      if (authError) { setErro(authError.message); return }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('users').update({ senha_provisoria: false }).eq('id', user.id)
      }

      router.push('/visao-geral')
    } finally {
      setSalvando(false)
    }
  }

  const inputStyle = {
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--bg-page)' }}>

      {/* Logo */}
      <div className="mb-8">
        <Image
          src="/logo-horizontal.png"
          alt="Hubtek Solutions"
          width={160}
          height={40}
          priority
        />
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        {/* Ícone */}
        <div className="flex justify-center mb-5">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <Lock size={20} color="#10B981" />
          </div>
        </div>

        <h1 className="text-lg font-semibold text-center mb-1"
          style={{ color: 'var(--text-primary)' }}>
          Defina sua senha
        </h1>
        <p className="text-sm text-center mb-6"
          style={{ color: 'var(--text-muted)' }}>
          Este é seu primeiro acesso. Crie uma senha pessoal para continuar.
        </p>

        {erro && (
          <div className="mb-4 text-sm rounded-lg px-3 py-2"
            style={{ color: '#EF4444', background: '#EF444410', border: '1px solid #EF444430' }}>
            {erro}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="password"
            placeholder="Nova senha (mín. 8 caracteres)"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmar}
            onChange={e => setConfirmar(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTrocar()}
            className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
            style={inputStyle}
          />
          <button
            onClick={handleTrocar}
            disabled={salvando}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{ background: '#10B981', color: '#fff' }}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {salvando ? 'Salvando...' : 'Definir senha e entrar'}
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        Hubtek Solutions · Suporte:{' '}
        <a href="https://wa.me/5551980104924" target="_blank" rel="noopener noreferrer"
          style={{ color: '#10B981' }}>
          wa.me/5551980104924
        </a>
      </p>
    </div>
  )
}
