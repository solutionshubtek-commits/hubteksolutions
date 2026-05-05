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
  const [esqueceuSenha, setEsqueceuSenha] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState(false)
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

  async function handleEsqueceuSenha(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `https://app.hubteksolutions.tech/nova-senha`,
    })
    if (error) {
      setErro('Erro ao enviar email. Verifique o endereço informado.')
      setCarregando(false)
      return
    }
    setEmailEnviado(true)
    setCarregando(false)
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
        {!esqueceuSenha ? (
          <>
            <h1 className="text-white text-2xl font-bold mb-1">Entrar</h1>
            <p className="text-[#A3A3A3] text-sm mb-6">Acesse sua conta Hubtek</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Email</label>
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
  <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Senha</label>
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
  <button
    type="button"
    onClick={() => { setEsqueceuSenha(true); setErro('') }}
    className="text-[#10B981] text-sm hover:underline mt-2 block"
  >
    Esqueci minha senha
  </button>
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
          </>
        ) : (
          <>
            <button
              onClick={() => { setEsqueceuSenha(false); setEmailEnviado(false); setErro('') }}
              className="text-[#A3A3A3] text-sm mb-4 hover:text-white flex items-center gap-1"
            >
              ← Voltar
            </button>
            <h1 className="text-white text-2xl font-bold mb-1">Recuperar senha</h1>
            <p className="text-[#A3A3A3] text-sm mb-6">
              Informe seu email e enviaremos um link para redefinir sua senha.
            </p>
            {emailEnviado ? (
              <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-4">
                <p className="text-[#10B981] text-sm">
                  ✅ Email enviado! Verifique sua caixa de entrada e siga as instruções.
                </p>
              </div>
            ) : (
              <form onSubmit={handleEsqueceuSenha} className="space-y-4">
                <div>
                  <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Email</label>
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
                  {carregando ? 'Enviando...' : 'Enviar link de recuperação'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
