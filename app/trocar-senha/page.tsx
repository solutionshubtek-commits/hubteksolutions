'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'

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
      // Atualizar senha no Auth
      const { error: authError } = await supabase.auth.updateUser({ password: senha })
      if (authError) { setErro(authError.message); return }

      // Marcar senha_provisoria = false na tabela users
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('users').update({ senha_provisoria: false }).eq('id', user.id)
      }

      router.push('/visao-geral')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="bg-gray-100 p-3 rounded-full">
            <Lock className="w-6 h-6 text-gray-700" />
          </div>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 text-center mb-1">Defina sua senha</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Este é seu primeiro acesso. Crie uma senha pessoal para continuar.
        </p>

        {erro && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
        )}

        <div className="space-y-3">
          <input
            type="password"
            placeholder="Nova senha (mín. 8 caracteres)"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <input
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmar}
            onChange={e => setConfirmar(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTrocar()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            onClick={handleTrocar}
            disabled={salvando}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Definir senha e entrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
