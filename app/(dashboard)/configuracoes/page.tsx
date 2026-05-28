'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Save, Upload, Trash2, FileText, AlertCircle, CheckCircle2,
  Image as ImageIcon, Camera, X, Calendar, Eye, EyeOff,
} from 'lucide-react'
import { GestaoOperadores } from '@/components/dashboard/GestaoOperadores'
import { GoogleCalendarGuide } from '@/components/dashboard/GoogleCalendarGuide'

interface KnowledgeFile {
  id: string; nome_arquivo: string; tipo: string; tamanho_bytes: number; criado_em: string
}
interface TenantData {
  id: string; nome: string; slug: string; prompt_agente: string
  mensagem_fora_horario: string; horario_funcionamento: HorarioFuncionamento
  avatar_url: string | null; google_calendar_config: GoogleCalendarConfig | null
}
interface HorarioFuncionamento {
  inicio: string; fim: string; dias: number[]; funcoes: string[]
}
interface GoogleCalendarConfig {
  client_email: string; private_key: string; calendar_id: string
}

const DIAS_SEMANA = [
  { num: 1, label: 'Seg' }, { num: 2, label: 'Ter' }, { num: 3, label: 'Qua' },
  { num: 4, label: 'Qui' }, { num: 5, label: 'Sex' }, { num: 6, label: 'Sáb' },
  { num: 0, label: 'Dom' },
]

const FUNCOES = [
  { id: 'agendamentos', label: '📅 Agendamentos' },
  { id: 'suporte',      label: '💬 Suporte'      },
  { id: 'vendas',       label: '🛒 Vendas'        },
  { id: 'leads',        label: '🎯 Qualif. de Lead' },
]

const DIAS_NUM_TO_STR: Record<number, string> = {
  0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab'
}

const HORARIO_PADRAO: HorarioFuncionamento = {
  inicio: '08:00', fim: '18:00', dias: [1, 2, 3, 4, 5], funcoes: []
}

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']
const ROLES_GESTAO = ['admin_hubtek', 'admin_tenant', 'self_managed']

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

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
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
  const [tenantId, setTenantId] = useState<string>('')
  const [role, setRole] = useState<string>('')
  const [horario, setHorario] = useState<HorarioFuncionamento>(HORARIO_PADRAO)
  const [funcoes, setFuncoes] = useState<string[]>([])
  const [arquivos, setArquivos] = useState<KnowledgeFile[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [uploadando, setUploadando] = useState(false)
  const [uploadProgresso, setUploadProgresso] = useState('')
  const [uploadandoAvatar, setUploadandoAvatar] = useState(false)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')

  const [gcClientEmail, setGcClientEmail] = useState('')
  const [gcPrivateKey, setGcPrivateKey] = useState('')
  const [gcCalendarId, setGcCalendarId] = useState('')
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [testingCalendar, setTestingCalendar] = useState(false)
  const [calendarTestResult, setCalendarTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const isGestao = ROLES_GESTAO.includes(role)
  const podeGerenciarOperadores = role === 'admin_tenant' || role === 'self_managed'
  const agendamentosAtivo = funcoes.includes('agendamentos')

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: userData } = await supabase
          .from('users').select('tenant_id, role').eq('id', user.id).single()
        if (!userData?.tenant_id) return
        setTenantId(userData.tenant_id)
        setRole(userData.role || '')
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, nome, slug, prompt_agente, mensagem_fora_horario, horario_funcionamento, avatar_url, google_calendar_config')
          .eq('id', userData.tenant_id)
          .single()
        if (tenantData) {
          setTenant(tenantData as TenantData)
          const h = tenantData.horario_funcionamento as HorarioFuncionamento | null
          const horarioSeguro: HorarioFuncionamento = {
            inicio: h?.inicio ?? HORARIO_PADRAO.inicio,
            fim: h?.fim ?? HORARIO_PADRAO.fim,
            dias: Array.isArray(h?.dias) ? h.dias : HORARIO_PADRAO.dias,
            funcoes: Array.isArray(h?.funcoes) ? h.funcoes : [],
          }
          setHorario(horarioSeguro)
          setFuncoes(horarioSeguro.funcoes)
          const gc = tenantData.google_calendar_config as GoogleCalendarConfig | null
          setGcClientEmail(gc?.client_email ?? '')
          setGcPrivateKey(gc?.private_key ?? '')
          setGcCalendarId(gc?.calendar_id ?? '')
        }
        if (ROLES_GESTAO.includes(userData.role)) {
          const { data: files } = await supabase
            .from('knowledge_base').select('id, nome_arquivo, tipo, tamanho_bytes, criado_em')
            .eq('tenant_id', userData.tenant_id).order('criado_em', { ascending: false })
          setArquivos(files || [])
        }
      } catch (err) {
        console.error('[configuracoes] fetchData error:', err)
      } finally {
        setCarregando(false)
      }
    }
    fetchData()
  }, [])

  async function handleUploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    if (!tenant || !e.target.files?.length) return
    const file = e.target.files[0]
    if (!TIPOS_IMAGEM.includes(file.type)) {
      setErro('Formato não suportado. Use JPG, PNG ou WEBP.')
      if (avatarInputRef.current) avatarInputRef.current.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErro('Imagem muito grande. Limite: 2MB.')
      if (avatarInputRef.current) avatarInputRef.current.value = ''
      return
    }
    setUploadandoAvatar(true); setErro('')
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `avatars/${tenant.id}.${ext}`
      await supabase.storage.from('mensagens-midia').remove([path])
      const { error: uploadErr } = await supabase.storage
        .from('mensagens-midia').upload(path, file, { upsert: true, contentType: file.type })
      if (uploadErr) throw uploadErr
      const { data: urlData } = supabase.storage.from('mensagens-midia').getPublicUrl(path)
      const novaUrl = `${urlData.publicUrl}?t=${Date.now()}`
      await supabase.from('tenants').update({ avatar_url: novaUrl }).eq('id', tenant.id)
      setTenant(prev => prev ? { ...prev, avatar_url: novaUrl } : prev)
    } catch (err) {
      console.error('[avatar upload]', err)
      setErro('Erro ao enviar imagem. Tente novamente.')
    }
    setUploadandoAvatar(false)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  async function handleRemoverAvatar() {
    if (!tenant?.avatar_url) return
    setUploadandoAvatar(true)
    try {
      const supabase = createClient()
      const url = new URL(tenant.avatar_url)
      const parts = url.pathname.split('/mensagens-midia/')
      if (parts[1]) await supabase.storage.from('mensagens-midia').remove([parts[1].split('?')[0]])
      await supabase.from('tenants').update({ avatar_url: null }).eq('id', tenant.id)
      setTenant(prev => prev ? { ...prev, avatar_url: null } : prev)
    } catch (err) {
      console.error('[avatar remove]', err)
      setErro('Erro ao remover imagem.')
    }
    setUploadandoAvatar(false)
  }

  async function handleSalvar() {
    if (!tenant) return
    setSalvando(true); setSucesso(false); setErro('')
    const supabase = createClient()

    const horarioComFuncoes: HorarioFuncionamento = { ...horario, funcoes }

    const gcConfig = gcClientEmail && gcPrivateKey && gcCalendarId
      ? { client_email: gcClientEmail.trim(), private_key: gcPrivateKey.trim(), calendar_id: gcCalendarId.trim() }
      : null

    const { error: tenantErr } = await supabase.from('tenants').update({
      prompt_agente: tenant.prompt_agente,
      mensagem_fora_horario: tenant.mensagem_fora_horario,
      horario_funcionamento: horarioComFuncoes,
      google_calendar_config: gcConfig,
    }).eq('id', tenant.id)

    if (tenantErr) {
      setErro('Erro ao salvar configurações. Tente novamente.')
      setSalvando(false)
      return
    }

    const diasStr = horario.dias.map(d => DIAS_NUM_TO_STR[d]).filter(Boolean)

    const { error: agentErr } = await supabase.from('agent_config').upsert({
      tenant_id: tenantId,
      prompt_principal: tenant.prompt_agente,
      mensagem_ausencia: tenant.mensagem_fora_horario,
      horario_inicio: horario.inicio,
      horario_fim: horario.fim,
      dias_funcionamento: diasStr,
      funcoes_ativas: funcoes,
      google_calendar_config: gcConfig,
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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!tenant || !e.target.files?.length) return
    const file = e.target.files[0]
    const isImagem = TIPOS_IMAGEM.includes(file.type)
    const limiteBytes = isImagem ? 5 * 1024 * 1024 : 50 * 1024 * 1024
    if (file.size > limiteBytes) {
      setErro(`Arquivo muito grande. Limite: ${isImagem ? '5MB' : '50MB'}.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploadando(true); setErro('')
    setUploadProgresso(
      isImagem ? 'Enviando imagem...'
      : file.type === 'application/pdf' ? 'Extraindo texto do PDF...'
      : file.type.includes('word') ? 'Extraindo texto do documento...'
      : 'Enviando arquivo...'
    )
    const formData = new FormData()
    formData.append('file', file)
    formData.append('tenant_id', tenant.id)
    const res = await fetch('/api/knowledge/upload', { method: 'POST', body: formData })
    const data = await res.json()
    setUploadando(false); setUploadProgresso('')
    if (!res.ok || !data.success) {
      setErro(data.error ?? 'Erro ao enviar arquivo.')
    } else {
      setArquivos(prev => [data.arquivo, ...prev])
    }
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

  async function handleTestCalendar() {
    if (!gcClientEmail || !gcPrivateKey || !gcCalendarId) return
    setTestingCalendar(true); setCalendarTestResult(null)
    try {
      const res = await fetch('/api/admin/testar-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_email: gcClientEmail.trim(),
          private_key: gcPrivateKey.trim(),
          calendar_id: gcCalendarId.trim(),
        }),
      })
      const data = await res.json()
      setCalendarTestResult(
        res.ok
          ? { ok: true, msg: 'Conexão com o Google Calendar funcionando!' }
          : { ok: false, msg: data.error ?? 'Erro ao conectar.' }
      )
    } catch {
      setCalendarTestResult({ ok: false, msg: 'Erro de rede ao testar conexão.' })
    }
    setTestingCalendar(false)
  }

  function toggleDia(d: number) {
    setHorario(prev => ({
      ...prev,
      dias: prev.dias.includes(d) ? prev.dias.filter(x => x !== d) : [...prev.dias, d]
    }))
  }

  function toggleFuncao(f: string) {
    setFuncoes(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])
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
          <div className="flex items-center gap-4 mb-6 pb-6" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="relative">
              {tenant?.avatar_url ? (
                <div className="w-16 h-16 rounded-xl overflow-hidden" style={{ border: '2px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tenant.avatar_url} alt={tenant.nome} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl flex items-center justify-center text-lg font-bold"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '2px solid rgba(16,185,129,0.25)', color: '#10B981' }}>
                  {tenant ? getInitials(tenant.nome) : '?'}
                </div>
              )}
              {uploadandoAvatar && (
                <div className="absolute inset-0 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Logo / Avatar da empresa</p>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>JPG, PNG ou WEBP · máx. 2MB · aparece na barra lateral</p>
              <div className="flex items-center gap-2">
                <button onClick={() => avatarInputRef.current?.click()} disabled={uploadandoAvatar}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <Camera size={12} />
                  {uploadandoAvatar ? 'Enviando...' : tenant?.avatar_url ? 'Alterar' : 'Enviar foto'}
                </button>
                {tenant?.avatar_url && (
                  <button onClick={handleRemoverAvatar} disabled={uploadandoAvatar}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 hover:text-red-400 hover:border-red-400/40"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <X size={12} /> Remover
                  </button>
                )}
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={handleUploadAvatar} className="hidden" />
              </div>
            </div>
          </div>
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
        </div>

        {/* Gestão de Operadores */}
        {podeGerenciarOperadores && tenantId && (
          <GestaoOperadores tenantId={tenantId} />
        )}

        {isGestao && (
          <>
            {/* Funções do agente */}
            <div className="rounded-xl p-6" style={cardStyle}>
              <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Agente de atendimento</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Descreva como o agente deve se comportar, qual o tom, quais informações usar.
              </p>
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                  Função principal do agente
                </p>
                <div className="flex flex-wrap gap-2">
                  {FUNCOES.map(f => (
                    <button key={f.id} type="button" onClick={() => toggleFuncao(f.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                      style={{
                        background: funcoes.includes(f.id) ? 'rgba(16,185,129,0.1)' : 'var(--bg-hover)',
                        borderColor: funcoes.includes(f.id) ? 'rgba(16,185,129,0.4)' : 'var(--border)',
                        color: funcoes.includes(f.id) ? '#10B981' : 'var(--text-muted)',
                      }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Prompt do agente</label>
              <textarea value={tenant?.prompt_agente || ''}
                onChange={(e) => setTenant(prev => prev ? { ...prev, prompt_agente: e.target.value } : prev)}
                rows={6} placeholder="Descreva como o agente deve se comportar..."
                className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none resize-none"
                style={inputStyle} />
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                {(tenant?.prompt_agente || '').length} caracteres · ~{Math.round((tenant?.prompt_agente || '').length / 4)} tokens
              </p>
            </div>

            {/* Horário */}
            <div className="rounded-xl p-6" style={cardStyle}>
              <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Horário de atendimento</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                O agente só responderá nos dias e horários marcados como ativos.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <input type="time" value={horario.inicio}
                  onChange={(e) => setHorario(prev => ({ ...prev, inicio: e.target.value }))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>até</span>
                <input type="time" value={horario.fim}
                  onChange={(e) => setHorario(prev => ({ ...prev, fim: e.target.value }))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>
              <div className="flex gap-2 flex-wrap mb-4">
                {DIAS_SEMANA.map(({ num, label }) => (
                  <button key={num} type="button" onClick={() => toggleDia(num)}
                    className="w-10 h-9 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      background: horario.dias.includes(num) ? 'rgba(16,185,129,0.1)' : 'var(--bg-hover)',
                      borderColor: horario.dias.includes(num) ? 'rgba(16,185,129,0.4)' : 'var(--border)',
                      color: horario.dias.includes(num) ? '#10B981' : 'var(--text-muted)',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              {horario.dias.length > 0 && (
                <div className="p-3 rounded-lg text-xs mb-4" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
                  Agente ativo: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {horario.dias.map(d => DIAS_SEMANA.find(x => x.num === d)?.label).join(', ')}
                  </span>
                  {' · '}
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{horario.inicio} às {horario.fim}</span>
                </div>
              )}
              <div>
                <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Mensagem fora do horário</label>
                <textarea value={tenant?.mensagem_fora_horario || ''}
                  onChange={(e) => setTenant(prev => prev ? { ...prev, mensagem_fora_horario: e.target.value } : prev)}
                  rows={3} placeholder="Ex: Olá! Nosso horário de atendimento é de seg–sex, das 8h às 18h..."
                  className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none resize-none" style={inputStyle} />
              </div>
            </div>

            {/* Google Calendar */}
            {(agendamentosAtivo || isGestao) && (
              <div className="rounded-xl p-6" style={cardStyle}>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={15} style={{ color: '#10B981' }} />
                  <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Integração Google Calendar</h2>
                </div>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  O agente usará estas credenciais para consultar, criar, reagendar e cancelar eventos automaticamente.
                </p>

                {/* ── Passo a passo em modal ── */}
                <div className="mb-4">
                  <GoogleCalendarGuide />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Client Email (Service Account)
                    </label>
                    <input type="email" value={gcClientEmail} onChange={(e) => setGcClientEmail(e.target.value)}
                      placeholder="nome@projeto.iam.gserviceaccount.com"
                      className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none font-mono" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Private Key
                    </label>
                    <div className="relative">
                      <textarea value={gcPrivateKey} onChange={(e) => setGcPrivateKey(e.target.value)}
                        placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                        rows={showPrivateKey ? 5 : 2}
                        className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none font-mono resize-none pr-10"
                        style={{ ...inputStyle, filter: showPrivateKey ? 'none' : 'blur(3px)', userSelect: showPrivateKey ? 'auto' : 'none' }} />
                      <button onClick={() => setShowPrivateKey(v => !v)}
                        className="absolute right-2 top-2 p-1 rounded transition-colors"
                        style={{ color: 'var(--text-muted)' }}>
                        {showPrivateKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Cole a chave completa incluindo os cabeçalhos BEGIN/END. Será salva de forma segura.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Calendar ID
                    </label>
                    <input type="text" value={gcCalendarId} onChange={(e) => setGcCalendarId(e.target.value)}
                      placeholder="exemplo@group.calendar.google.com"
                      className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none font-mono" style={inputStyle} />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button onClick={handleTestCalendar}
                      disabled={testingCalendar || !gcClientEmail || !gcPrivateKey || !gcCalendarId}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}>
                      {testingCalendar
                        ? <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> Testando...</>
                        : <><Calendar size={12} /> Testar conexão</>
                      }
                    </button>
                    {calendarTestResult && (
                      <span className={`text-xs font-medium ${calendarTestResult.ok ? 'text-[#10B981]' : 'text-red-400'}`}>
                        {calendarTestResult.ok ? '✓' : '✗'} {calendarTestResult.msg}
                      </span>
                    )}
                  </div>
                  {gcClientEmail && gcPrivateKey && gcCalendarId && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      <p className="text-xs" style={{ color: '#10B981' }}>
                        Credenciais configuradas — salve para ativar no agente
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Base de conhecimento */}
            <div className="rounded-xl p-6" style={cardStyle}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Base de conhecimento</h2>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadando}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <Upload size={14} />{uploadando ? 'Processando...' : 'Enviar arquivo'}
                </button>
                <input ref={fileInputRef} type="file"
                  accept=".pdf,.docx,.txt,.xlsx,image/jpeg,image/png,image/webp"
                  onChange={handleUpload} className="hidden" />
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Documentos: PDF, DOCX, TXT, XLSX (máx. 50MB) · Imagens: JPG, PNG, WEBP (máx. 5MB)
              </p>
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
                      <div key={arquivo.id} className="flex items-center justify-between rounded-lg px-4 py-3"
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
                        <button onClick={() => handleExcluir(arquivo.id, arquivo.nome_arquivo)}
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

        {isGestao && (
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