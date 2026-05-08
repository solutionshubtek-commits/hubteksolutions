'use client'
import { useEffect, useState, useRef, CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, Upload, Trash2, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'

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

const DIAS_SEMANA: { key: keyof HorarioFuncionamento; label: string }[] = [
  { key: 'seg', label: 'Seg' }, { key: 'ter', label: 'Ter' }, { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' }, { key: 'sex', label: 'Sex' }, { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === 'text/plain') return await file.text()
  return ''
}

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

export default function ConfiguracoesPage() {
  const [tenant, setTenant] = useState<TenantData | null>(null)
  const [role, setRole] = useState<string>('')
  const [horario, setHorario] = useState<HorarioFuncionamento>(HORARIO_PADRAO)
  const [arquivos, setArquivos] = useState<KnowledgeFile[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [uploadando, setUploadando] = useState(false)
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
      const { data: userData } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
      if (!userData?.tenant_id) return
      setRole(userData.role || '')
      const { data: tenantData } = await supabase.from('tenants')
        .select('id, nome, slug, prompt_agente, mensagem_fora_horario, horario_funcionamento')
        .eq('id', userData.tenant_id).single()
      if (tenantData) {
        setTenant(tenantData)
        setHorario(tenantData.horario_funcionamento || HORARIO_PADRAO)
      }
      if (userData.role === 'self_managed') {
        const { data: files } = await supabase.from('knowledge_base')
          .select('id, nome_arquivo, tipo, tamanho_bytes, criado_em')
          .eq('tenant_id', userData.tenant_id).order('criado_em', { ascending: false })
        setArquivos(files || [])
      }
      setCarregando(false)
    }
    fetchData()
  }, [])

  async function handleSalvar() {
    if (!tenant) return
    setSalvando(true); setSucesso(false); setErro('')
    const supabase = createClient()
    const { error } = await supabase.from('tenants').update({
      prompt_agente: tenant.prompt_agente,
      mensagem_fora_horario: tenant.mensagem_fora_horario,
      horario_funcionamento: horario,
    }).eq('id', tenant.id)
    setSalvando(false)
    if (error) { setErro('Erro ao salvar. Tente novamente.') }
    else { setSucesso(true); setTimeout(() => setSucesso(false), 3000) }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!tenant || !e.target.files?.length) return
    const file = e.target.files[0]
    setUploadando(true); setErro('')
    const supabase = createClient()
    const path = `${tenant.id}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('knowledge-base').upload(path, file)
    if (uploadError) { setErro('Erro no upload. Verifique o tipo/tamanho do arquivo.'); setUploadando(false); return }
    const conteudo = await extractTextFromFile(file)
    const { data: novoArquivo, error: dbError } = await supabase.from('knowledge_base').insert({
      tenant_id: tenant.id, nome_arquivo: file.name, tipo: file.type,
      conteudo_texto: conteudo, tamanho_bytes: file.size,
    }).select('id, nome_arquivo, tipo, tamanho_bytes, criado_em').single()
    if (dbError) { setErro('Erro ao registrar arquivo no banco.') }
    else if (novoArquivo) { setArquivos(prev => [novoArquivo, ...prev]) }
    setUploadando(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
              <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Agente de atendimento</h2>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Prompt do agente</label>
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
              <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Horário de atendimento</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {DIAS_SEMANA.map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <Toggle ativo={horario[key].ativo} onClick={() => toggleDia(key)} />
                    <span style={{ width: 36, minWidth: 36, flexShrink: 0, fontSize: 14, fontWeight: 500,
                      color: horario[key].ativo ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {label}
                    </span>
                    {horario[key].ativo ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <input type="time" value={horario[key].inicio}
                          onChange={(e) => updateHorarioDia(key, 'inicio', e.target.value)}
                          style={{ flex: 1, minWidth: 0, ...inputStyle, borderRadius: 8, padding: '8px', fontSize: 14 }}
                          className="focus:outline-none"
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>até</span>
                        <input type="time" value={horario[key].fim}
                          onChange={(e) => updateHorarioDia(key, 'fim', e.target.value)}
                          style={{ flex: 1, minWidth: 0, ...inputStyle, borderRadius: 8, padding: '8px', fontSize: 14 }}
                          className="focus:outline-none"
                        />
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-label)', fontSize: 14 }}>Fechado</span>
                    )}
                  </div>
                ))}
              </div>
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
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  <Upload size={14} />
                  {uploadando ? 'Enviando...' : 'Enviar arquivo'}
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" />
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Formatos aceitos: PDF, DOCX, TXT — máximo 50MB</p>

              {arquivos.length === 0 ? (
                <div className="rounded-lg p-8 text-center"
                  style={{ border: '1px dashed var(--border-2)' }}>
                  <FileText size={24} className="mx-auto mb-2" style={{ color: 'var(--text-label)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum arquivo enviado ainda</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {arquivos.map((arquivo) => (
                    <div key={arquivo.id}
                      className="flex items-center justify-between rounded-lg px-4 py-3"
                      style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={16} className="text-[#10B981] flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{arquivo.nome_arquivo}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatBytes(arquivo.tamanho_bytes)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleExcluir(arquivo.id, arquivo.nome_arquivo)}
                        disabled={excluindo === arquivo.id}
                        className="hover:text-red-400 disabled:opacity-40 transition-colors ml-3 flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{erro}</p>
          </div>
        )}
        {sucesso && (
          <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#10B981] flex-shrink-0" />
            <p className="text-[#10B981] text-sm">Configurações salvas com sucesso!</p>
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
