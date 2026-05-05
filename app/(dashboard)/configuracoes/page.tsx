'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save } from 'lucide-react'

interface Configuracoes {
  nome: string
  slug: string
  prompt_agente: string
  horario_inicio: string
  horario_fim: string
  mensagem_fora_horario: string
}

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<Configuracoes>({
    nome: '',
    slug: '',
    prompt_agente: '',
    horario_inicio: '08:00',
    horario_fim: '18:00',
    mensagem_fora_horario: '',
  })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [tenantId, setTenantId] = useState('')

  useEffect(() => {
    async function fetchConfig() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (!userData?.tenant_id) return
      setTenantId(userData.tenant_id)
      const { data } = await supabase
        .from('tenants')
        .select('nome, slug, prompt_agente, horario_inicio, horario_fim, mensagem_fora_horario')
        .eq('id', userData.tenant_id)
        .single()
      if (data) setConfig(data)
      setCarregando(false)
    }
    fetchConfig()
  }, [])

  async function handleSalvar() {
    setSalvando(true)
    setSucesso(false)
    const supabase = createClient()
    await supabase
      .from('tenants')
      .update({
        prompt_agente: config.prompt_agente,
        horario_inicio: config.horario_inicio,
        horario_fim: config.horario_fim,
        mensagem_fora_horario: config.mensagem_fora_horario,
      })
      .eq('id', tenantId)
    setSalvando(false)
    setSucesso(true)
    setTimeout(() => setSucesso(false), 3000)
  }

  if (carregando) {
    return (
      <div>
        <h1 className="text-white text-2xl font-bold mb-6">Configurações</h1>
        <div className="space-y-4 max-w-2xl">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Configurações</h1>

      <div className="max-w-2xl space-y-6">
        <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Dados do tenant</h2>
          <div className="space-y-4">
            <div>
              <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Nome</label>
              <input
                type="text"
                value={config.nome}
                disabled
                className="w-full bg-[#050505] border border-[#1F1F1F] text-[#6B6B6B]
                  rounded-lg px-4 py-3 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Slug</label>
              <input
                type="text"
                value={config.slug}
                disabled
                className="w-full bg-[#050505] border border-[#1F1F1F] text-[#6B6B6B]
                  rounded-lg px-4 py-3 text-sm cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Agente de atendimento</h2>
          <div>
            <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Prompt do agente</label>
            <textarea
              value={config.prompt_agente || ''}
              onChange={(e) => setConfig({ ...config, prompt_agente: e.target.value })}
              rows={6}
              placeholder="Descreva como o agente deve se comportar..."
              className="w-full bg-[#050505] border border-[#1F1F1F] text-white
                placeholder-[#6B6B6B] rounded-lg px-4 py-3 text-sm focus:outline-none
                focus:border-[#10B981] resize-none"
            />
          </div>
        </div>

        <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Horário de atendimento</h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Início</label>
              <input
                type="time"
                value={config.horario_inicio || '08:00'}
                onChange={(e) => setConfig({ ...config, horario_inicio: e.target.value })}
                className="w-full bg-[#050505] border border-[#1F1F1F] text-white
                  rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#10B981]"
              />
            </div>
            <div className="flex-1">
              <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Fim</label>
              <input
                type="time"
                value={config.horario_fim || '18:00'}
                onChange={(e) => setConfig({ ...config, horario_fim: e.target.value })}
                className="w-full bg-[#050505] border border-[#1F1F1F] text-white
                  rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#10B981]"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-[#A3A3A3] text-sm font-medium block mb-2">Mensagem fora do horário</label>
            <textarea
              value={config.mensagem_fora_horario || ''}
              onChange={(e) => setConfig({ ...config, mensagem_fora_horario: e.target.value })}
              rows={3}
              placeholder="Ex: Olá! Nosso horário de atendimento é das 8h às 18h..."
              className="w-full bg-[#050505] border border-[#1F1F1F] text-white
                placeholder-[#6B6B6B] rounded-lg px-4 py-3 text-sm focus:outline-none
                focus:border-[#10B981] resize-none"
            />
          </div>
        </div>

        {sucesso && (
          <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3">
            <p className="text-[#10B981] text-sm">✅ Configurações salvas com sucesso!</p>
          </div>
        )}

        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50
            text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200"
        >
          <Save size={16} />
          {salvando ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}
