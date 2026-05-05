'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function NovaSenhaPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setErro('As senhas não coincidem.')
      return
    }
    if (password.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    setCarregando(true)
    setErro('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErro('Erro ao atualizar senha. Tente novamente.')
      setCarregando(false)
      return
    }
    setSucesso(true)
    setTimeout(() => router.push('/'), 3000)
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
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            const parent = target.parentElement
            if (parent) {
              parent.innerHTML = '<span class="text-white text-xl font-bold">Hubtek Solutions</span>'
            }
          }}
        />
      </div>

      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-8">
        <h1 className="text-white text-2xl font-bold mb-1">Nova senha</h1>
        <p className="text-[#A3A3A3] text-sm mb-6">Digite sua nova senha abaixo.</p>

        {sucesso ? (
          <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-4">
            <p className="text-[#10B981] text-sm">
              ✅ Senha atualizada! Redirecionando para o login...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Nova senha</label>
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
            <div>
              <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Confirmar senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              {carregando ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
