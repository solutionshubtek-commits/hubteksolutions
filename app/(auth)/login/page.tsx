'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setErro('Email ou senha incorretos. Verifique suas credenciais.')
      setCarregando(false)
      return
    }

    router.push('/visao-geral')
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex justify-center mb-8">
        <Image
          src="/logo-horizontal.png"
          alt="Hubtek Solutions"
          width={160}
          height={32}
          priority
        />
      </div>

      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-8">
        <h1 className="text-white text-2xl font-bold mb-1">Entrar</h1>
        <p className="text-[#A3A3A3] text-sm mb-6">Acesse sua conta Hubtek</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[#A3A3A3] text-sm font-medium block mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="w-full bg-[#0A0A0A] border border-[#262626] text-white
                placeholder-[#A3A3A3] rounded-lg px-4 py-3 focus:outline-none
                focus:border-[#10B981] transition-all duration-200"
            />
          </div>

          <div>
            <label className="text-[#A3A3A3] text-sm font-medium block mb-2">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-[#0A0A0A] border border-[#262626] text-white
                placeholder-[#A3A3A3] rounded-lg px-4 py-3 focus:outline-none
                focus:border-[#10B981] transition-all duration-200"
            />
          </div>

          {erro && (
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3">
              <p className="text-[#EF4444] text-sm">{erro}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-[#10B981] hover:bg-[#059669] disabled:opacity-50
              text-white font-semibold py-3 rounded-lg transition-all duration-200
              disabled:cursor-not-allowed"
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
