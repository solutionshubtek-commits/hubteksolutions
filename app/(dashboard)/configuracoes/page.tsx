'use client'
import { useEffect, useState, useRef, CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, Upload, Trash2, FileText, AlertCircle, CheckCircle2, Image as ImageIcon } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiaConfig { ativo: boolean; inicio: string; fim: string }
interface HorarioFuncionamento {
  seg: DiaConfig; ter: DiaConfig; qua: DiaConfig; qui: DiaConfig
  sex: DiaConfig; sab: DiaConfig; dom: DiaConfig
}
interface KnowledgeFile {
  id: string; nome_arquivo: string; tipo: string; tamanho_bytes: number; criado_em: string
}
interface TenantData {
  id: string; nome: string; slug: string; prompt_agente: string
  mensagem_fora_horario: string; horario_funcionamento: HorarioFuncionamento
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIAS_SEMANA: { key: keyof HorarioFuncionamento; label: string; agentKey: string }[] = [
  { key: 'seg', label: 'Seg', agentKey: 'seg' },
  { key: 'ter', label: 'Ter', agentKey: 'ter' },
  { key: 'qua', label: 'Qua', agentKey: 'qua' },
  { key: 'qui', label: 'Qui', agentKey: 'qui' },
  { key: 'sex', label: 'Sex', agentKey: 'sex' },
  { key: 'sab', label: 'Sáb', agentKey: 'sab' },
  { key: 'dom', label: 'Dom', agentKey: 'dom' },
]

const HORARIO_PADRAO: HorarioFuncionamento = {
  seg: { ativo: true,  inicio: '08:00', fim: '18:00' },
  ter: { ativo: true,  inicio: '08:00', fim: '18:00' },
  qua: { ativo: true,  inicio: '08:00', fim: '18:00' },
  qui: { ativo: true,  inicio: '08:00', fim: '18:00' },
  sex: { ativo: true,  inicio: '08:00', fim: '18:00' },
  sab: { ativo: false, inicio: '08:00', fim: '12:00' },
  dom: { ativo: false, inicio: '08:00', fim: '12:00' },
}

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function iconeArquivo(tipo: string, nome: string) {
  if (TIPOS_IMAGEM.includes(tipo) || /\.(jpg|jpeg|png|webp)$/i.test(nome)) return '🖼️'
  if (tipo === 'application/pdf' || nome.endsWith('.pdf')) return '📄'
  if (tipo.includes('word') || nome.endsWith('.docx')) return '📝'
  if (tipo.includes('sheet') || nome.endsWith('.xlsx')) return '📊'
  return '📃'
}

function derivarAgentConfig(horario: HorarioFuncionamento): {
  horario_inicio: string
  horario_fim: string
  dias_funcionamento: string[]
} {
  const diasAtivos = DIAS_SEMANA.filter(d => horario[d.key].ativo)

  if (diasAtivos.length === 0) {
    return { horario_inicio: '08:00', horario_fim: '18:00', dias_funcionamento: [] }
  }

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const fromMinutes = (m: number) => {
    const h = Math.floor(m / 60).toString().padStart(2, '0')
    const min = (m % 60).toString().padStart(2, '0')
    return `${h}:${min}`
  }

  let minInicio = Infinity
  let maxFim = 0

  diasAtivos.forEach(d => {
    const ini = toMinutes(horario[d.key].inicio)
    const fim = toMinutes(horario[d.key].fim)
    if (ini < minInicio) minInicio = ini
    if (fim > maxFim) maxFim = fim
  })

  return {
    horario_inicio: fromMinutes(minInicio),
    horario_fim: fromMinutes(maxFim),
    dias_funcionamento: diasAtivos.map(d => d.agentKey),
  }
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ ativo, onClick }: { ativo: boolean; onClick: () => void }) {
  const trackStyle: CSSProperties = {
    width: 44, minWidth: 44, height: 24, padding: 0, margin: 0,
    border: 'none', outline: 'none', borderRadius: 999, position: 'relative',
    cursor: 'pointer', flexShrink: 0, display: 'inline-block', boxSizing: 'border-box',
    backgroundColor: ativo ? '#10B981' : 'var(--border-2)',
    transition: 'background-color 0.2s ease',
    appearance: 'none', WebkitAppearance: 'none',
  }
  const thumbStyle: CSSProperties = {
    position: 'absolute', top: 2, left: ativo ? 22 : 2,
    width: 20, height: 20, borderRadius: '50%', backgroundColor: '#FFFFFF',
    transition: 'left 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
    display: 'block', pointerEvents: 'none',
  }
  return (
    <button type="button" onClick={onClick} style={trackStyle} aria-checked={ativo} role="switch">
      <span style={thumbStyle} />
    </button>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Configurações</h1>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const [tenant, setTenant] = useState<TenantData | null>(null)
  const [tenantId, setTenantId] = useState<string>('')
  const [role, setRole] = useState<string>('')
  const [horario, setHorario] = useState<HorarioFuncionamento>(HORARIO_PADRAO)
  const [arquivos, setArquivos] = useState<KnowledgeFile[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [uploadando, setUploadando] = useState(false)
  const [uploadProgresso, setUploadProgresso] = useState('')
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSelfManaged = role === 'self_managed'

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id, role')
        .eq('id', user.id)
        .single()
      if (!userData?.tenant_id) return

      setTenantId(userData.tenant_id)
      setRole(userData.role || '')

      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, nome, slug, prompt_agente, mensagem_fora_horario, horario_funcionamento')
        .eq('id', userData.tenant_id)
        .single()

      if (tenantData) {
        setTenant(tenantData)
        setHorario(tenantData.horario_funcionamento || HORARIO_PADRAO)
      }

      if (userData.role === 'self_managed') {
        const { data: files } = await supabase
          .from('knowledge_base')
          .select('id, nome_arquivo, tipo, tamanho_bytes, criado_em')
          .eq('tenant_id', userData.tenant_id)
          .order('criado_em', { ascending: false })
        setArquivos(files || [])
      }

      setCarregando(false)
    }
    fetchData()
  }, [])

  // ── Salvar ──────────────────────────────────────────────────────────────────
  async function handleSalvar() {
    if (!tenant) return
    setSalvando(true); setSucesso(false); setErro('')
    const supabase = createClient()

    const { error: tenantErr } = await supabase.from('tenants').update({
      prompt_agente: tenant.prompt_agente,
      mensagem_fora_horario: tenant.mensagem_fora_horario,
      horario_funcionamento: horario,
    }).eq('id', tenant.id)

    if (tenantErr) {
      setErro('Erro ao salvar configurações. Tente novamente.')
      setSalvando(false)
      return
    }

    const agentDerived = derivarAgentConfig(horario)

    const { error: agentErr } = await supabase.from('agent_config').upsert({
      tenant_id: tenantId,
      prompt_principal: tenant.prompt_agente,
      mensagem_ausencia: tenant.mensagem_fora_horario,
      horario_inicio: agentDerived.horario_inicio,
      horario_fim: agentDerived.horario_fim,
      dias_funcionamento: agentDerived.dias_funcionamento,
      motor_ia_principal: 'openai',
      motor_ia_backup: 'anthropic',
      ativo: true,
      temperatura: 0.7,
      max_tokens: 1000,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'tenant_id' })

    setSalvando(false)

    if (agentErr) {
      setErro('Configurações salvas parcialmente. Erro ao sincronizar com o agente: ' + agentErr.message)
      return
    }

    setSucesso(true)
    setTimeout(() => setSucesso(false), 3000)
  }

  // ── Upload via rota server-side ─────────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!tenant || !e.target.files?.length) return
    const file = e.target.files[0]

    const isImagem = TIPOS_IMAGEM.includes(file.type)
    const limiteBytes = isImagem ? 5 * 1024 * 1024 : 50 * 1024 * 1024
    const limiteLabel = isImagem ? '5MB' : '50MB'

    if (file.size > limiteBytes) {
      setErro(`Arquivo muito grande. Limite máximo para ${isImagem ? 'imagens' : 'documentos'}: ${limiteLabel}.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploadando(true)
    setErro('')

    if (isImagem) {
      setUploadProgresso('Enviando imagem...')
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      setUploadProgresso('Extraindo texto do PDF...')
    } else if (file.type.includes('word') || file.name.endsWith('.docx')) {
      setUploadProgresso('Extraindo texto do documento...')
    } else {
      setUploadProgresso('Enviando arquivo...')
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('tenant_id', tenant.id)

    const res = await fetch('/api/knowledge-base/upload', {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()
    setUploadando(false)
    setUploadProgresso('')

    if (!res.ok || !data.success) {
      setErro(data.error ?? 'Erro ao enviar arquivo.')
    } else {
      setArquivos(prev => [data.arquivo, ...prev])
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Excluir arquivo ─────────────────────────────────────────────────────────
  async function handleExcluir(id: string, nomeArquivo: string) {
    if (!tenant) return
    setExcluindo(id)
    const supabase = createClient()
    const { data: lista } = await supabase.storage.from('knowledge-base').list(tenant.id)
    const arquivo = lista?.find(f => f.name.endsWith(nomeArquivo))
    if (arquivo) await supabase.storage.from('knowledge-base').remove([`${tenant.id}/${arquivo.name}`])
    await supabase.from('knowledge_base').delete().eq('id', id)
    setArquivos(prev => prev.filter(a => a.id !== id))
    setExcluindo(null)
  }

  function toggleDia(dia: keyof HorarioFuncionamento) {
    setHorario(prev => ({ ...prev, [dia]: { ...prev[dia], ativo: !prev[dia].ativo } }))
  }
  function updateHorarioDia(dia: keyof HorarioFuncionamento, campo: 'inicio' | 'fim', valor: string) {
    setHorario(prev => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor } }))
  }

  if (carregando) return <Skeleton />

  const cardStyle = { background: 'var(--bg-surface)', border: '1px solid var(--border)' }
  const inputStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
  const inputDisabledStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'not-allowed' }

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">

        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Configurações</h1>

        {/* Dados do tenant */}
        <div className="rounded-xl p-6" style={cardStyle}>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Dados do tenant</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Nome</label>
              <input type="text" value={tenant?.nome || ''} disabled
                className="w-full rounded-lg px-4 py-3 text-sm" style={inputDisabledStyle} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Slug</label>
              <input type="text" value={tenant?.slug || ''} disabled
                className="w-full rounded-lg px-4 py-3 text-sm" style={inputDisabledStyle} />
            </div>
          </div>
          {!isSelfManaged && (
            <p className="mt-4 text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <AlertCircle size={12} />
              Configurações avançadas disponíveis apenas para contas self-managed.
            </p>
          )}
        </div>

        {isSelfManaged && (
          <>
            {/* Agente */}
            <div className="rounded-xl p-6" style={cardStyle}>
              <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Agente de atendimento</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Descreva como o agente deve se comportar, qual o tom, quais informações usar.
              </p>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
                Prompt do agente
              </label>
              <textarea
                value={tenant?.prompt_agente || ''}
                onChange={(e) => setTenant(prev => prev ? { ...prev, prompt_agente: e.target.value } : prev)}
                rows={6}
                placeholder="Descreva como o agente deve se comportar..."
                className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none resize-none"
                style={{ ...inputStyle, outlineColor: '#10B981' }}
              />
            </div>

            {/* Horário */}
            <div className="rounded-xl p-6" style={cardStyle}>
              <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Horário de atendimento</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                O agente só responderá nos dias e horários marcados como ativos.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {DIAS_SEMANA.map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <Toggle ativo={horario[key].ativo} onClick={() => toggleDia(key)} />
                    <span style={{
                      width: 36, minWidth: 36, flexShrink: 0, fontSize: 14, fontWeight: 500,
                      color: horario[key].ativo ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}>
                      {label}
                    </span>
                    {horario[key].ativo ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <input type="time" value={horario[key].inicio}
                          onChange={(e) => updateHorarioDia(key, 'inicio', e.target.value)}
                          style={{ flex: 1, minWidth: 0, ...inputStyle, borderRadius: 8, padding: '8px', fontSize: 14 }}
                          className="focus:outline-none" />
                        <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>até</span>
                        <input type="time" value={horario[key].fim}
                          onChange={(e) => updateHorarioDia(key, 'fim', e.target.value)}
                          style={{ flex: 1, minWidth: 0, ...inputStyle, borderRadius: 8, padding: '8px', fontSize: 14 }}
                          className="focus:outline-none" />
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Fechado</span>
                    )}
                  </div>
                ))}
              </div>

              {(() => {
                const derived = derivarAgentConfig(horario)
                if (derived.dias_funcionamento.length === 0) return null
                return (
                  <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
                    Agente ativo: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {derived.dias_funcionamento.join(', ')}
                    </span> · <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {derived.horario_inicio} às {derived.horario_fim}
                    </span>
                  </div>
                )
              })()}

              <div className="mt-5">
                <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Mensagem fora do horário
                </label>
                <textarea
                  value={tenant?.mensagem_fora_horario || ''}
                  onChange={(e) => setTenant(prev => prev ? { ...prev, mensagem_fora_horario: e.target.value } : prev)}
                  rows={3}
                  placeholder="Ex: Olá! Nosso horário de atendimento é de seg–sex, das 8h às 18h..."
                  className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none resize-none"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Base de conhecimento */}
            <div className="rounded-xl p-6" style={cardStyle}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Base de conhecimento</h2>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadando}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <Upload size={14} />
                  {uploadando ? 'Processando...' : 'Enviar arquivo'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.xlsx,image/jpeg,image/png,image/webp"
                  onChange={handleUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Documentos: PDF, DOCX, TXT, XLSX (máx. 50MB) · Imagens: JPG, PNG, WEBP (máx. 5MB)
              </p>

              {/* Progresso do upload */}
              {uploadando && uploadProgresso && (
                <div className="mb-3 flex items-center gap-2 p-3 rounded-lg"
                  style={{ background: '#10B98110', border: '1px solid #10B98130' }}>
                  <div className="w-3 h-3 rounded-full border-2 border-[#10B981] border-t-transparent animate-spin flex-shrink-0" />
                  <p className="text-xs text-[#10B981]">{uploadProgresso}</p>
                </div>
              )}

              {arquivos.length === 0 ? (
                <div className="rounded-lg p-8 text-center" style={{ border: '1px dashed var(--border-2)' }}>
                  <FileText size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum arquivo enviado ainda</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {arquivos.map((arquivo) => {
                    const isImg = TIPOS_IMAGEM.includes(arquivo.tipo) || /\.(jpg|jpeg|png|webp)$/i.test(arquivo.nome_arquivo)
                    return (
                      <div key={arquivo.id}
                        className="flex items-center justify-between rounded-lg px-4 py-3"
                        style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-3 min-w-0">
                          {isImg ? (
                            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                              <ImageIcon size={16} style={{ color: '#3B82F6' }} />
                            </div>
                          ) : (
                            <span className="text-base flex-shrink-0">{iconeArquivo(arquivo.tipo, arquivo.nome_arquivo)}</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{arquivo.nome_arquivo}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {formatBytes(arquivo.tamanho_bytes)}
                              {isImg && <span className="ml-1.5 text-[#3B82F6]">· imagem</span>}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleExcluir(arquivo.id, arquivo.nome_arquivo)}
                          disabled={excluindo === arquivo.id}
                          className="hover:text-red-400 disabled:opacity-40 transition-colors ml-3 flex-shrink-0"
                          style={{ color: 'var(--text-muted)' }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Feedback */}
        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{erro}</p>
          </div>
        )}
        {sucesso && (
          <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#10B981] flex-shrink-0" />
            <p className="text-[#10B981] text-sm">Configurações salvas e agente atualizado com sucesso!</p>
          </div>
        )}

        {isSelfManaged && (
          <button onClick={handleSalvar} disabled={salvando}
            className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200">
            <Save size={16} />
            {salvando ? 'Salvando...' : 'Salvar configurações'}
          </button>
        )}

      </div>
    </div>
  )
}
