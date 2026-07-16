// app/(auth)/nova-senha/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

const MIN_SENHA = 8

export default function NovaSenhaPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [verificandoSessao, setVerificandoSessao] = useState(true)
  const [sessaoValida, setSessaoValida] = useState(false)
  const router = useRouter()

  // AJUSTE (F7 — recuperação de senha): quando o usuário chega aqui pelo
  // /auth/callback, a sessão de recuperação já existe. Se alguém abrir a URL
  // direto (sem link), não há sessão — mostramos um aviso claro em vez de
  // deixar o updateUser falhar com "Auth session missing".
  useEffect(() => {
    async function verificar() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      setSessaoValida(!!session)
      setVerificandoSessao(false)
    }
    verificar()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setErro('As senhas não coincidem.')
      return
    }
    if (password.length < MIN_SENHA) {
      setErro(`A senha deve ter pelo menos ${MIN_SENHA} caracteres.`)
      return
    }
    setCarregando(true)
    setErro('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setErro(
        error.message.toLowerCase().includes('session')
          ? 'Sua sessão de recuperação expirou. Solicite um novo link.'
          : 'Erro ao atualizar senha. Tente novamente.'
      )
      setCarregando(false)
      return
    }

    // AJUSTE: se a conta ainda estava marcada com senha provisória, limpa a
    // flag — senão o middleware manda o usuário para /trocar-senha em loop.
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('users').update({ senha_provisoria: false }).eq('id', user.id)
      }
    } catch {
      // não crítico — a senha já foi trocada com sucesso
    }

    setSucesso(true)
    setTimeout(() => {
      router.push('/visao-geral')
      router.refresh()
    }, 2000)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex justify-center mb-8">
        <Image
          src="/logo-verde.png"
          alt="Hubtek Agents"
          width={240}
          height={60}
          priority
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            const parent = target.parentElement
            if (parent) {
              parent.innerHTML = '<span class="text-white text-xl font-bold">Hubtek Agents</span>'
            }
          }}
        />
      </div>

      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-8">
        <h1 className="text-white text-2xl font-bold mb-1">Nova senha</h1>
        <p className="text-[#A3A3A3] text-sm mb-6">Digite sua nova senha abaixo.</p>

        {verificandoSessao ? (
          <div className="flex items-center gap-2 text-[#A3A3A3] text-sm py-4">
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            Validando link...
          </div>
        ) : !sessaoValida ? (
          <div className="space-y-4">
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-4">
              <p className="text-[#EF4444] text-sm font-medium">Link inválido ou expirado</p>
              <p className="text-[#A3A3A3] text-xs mt-1.5 leading-relaxed">
                Links de recuperação valem por 1 hora e só podem ser usados uma vez.
                Solicite um novo para continuar.
              </p>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-[#10B981] hover:bg-[#059669] text-white font-semibold
                py-3 rounded-lg transition-all duration-200"
            >
              Voltar ao login
            </button>
          </div>
        ) : sucesso ? (
          <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-4">
            <p className="text-[#10B981] text-sm">
              ✅ Senha atualizada! Entrando na plataforma...
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
                placeholder={`Mínimo ${MIN_SENHA} caracteres`}
                autoComplete="new-password"
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
                autoComplete="new-password"
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