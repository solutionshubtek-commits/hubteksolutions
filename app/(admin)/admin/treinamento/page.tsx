'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { History, CheckCircle, Upload, X, AlertTriangle, ChevronDown } from 'lucide-react'

interface Tenant {
  id: string; nome: string; slug: string; status: string
  expira_em: string | null; agente_ativo: boolean
  agente_pausado_em: string | null; prompt_agente: string | null
  horario_funcionamento: HorarioFuncionamento | null
  mensagem_fora_horario: string | null
}
interface HorarioFuncionamento {
  inicio: string; fim: string; dias: number[]; funcoes?: string[]
}
interface KbDoc {
  id: string; nome_arquivo: string; tipo: string
  tamanho_bytes: number; criado_em: string
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0]
const FUNCOES = [
  { id: 'agendamentos', label: '📅 Agendamentos' },
  { id: 'suporte',      label: '💬 Suporte' },
  { id: 'vendas',       label: '🛒 Vendas' },
  { id: 'leads',        label: '🎯 Qualif. de Lead' },
]
const DOC_ICON: Record<string, string> = {
  pdf: '📄', docx: '📝', doc: '📝', txt: '📃', xlsx: '📊', xls: '📊',
  'image/jpeg': '🖼️', 'image/png': '🖼️', 'image/webp': '🖼️',
}

const TIPOS_ACEITOS_UPLOAD = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/webp',
]

function fmtBytes(b: number) {
  if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + ' MB'
  if (b >= 1024) return Math.round(b / 1024) + ' KB'
  return b + ' B'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()
}

export default function AdminTreinamentoPage() {
  const supabase = createClient()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgresso, setUploadProgresso] = useState('')
  const [erroUpload, setErroUpload] = useState('')
  const [deletando, setDeletando] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [funcoes, setFuncoes] = useState<string[]>([])
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFim, setHoraFim] = useState('18:00')
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5])
  const [agentOn, setAgentOn] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('tenants')
        .select('id, nome, slug, status, expira_em, agente_ativo, agente_pausado_em, prompt_agente, horario_funcionamento, mensagem_fora_horario')
        .order('nome')
      if (data && data.length > 0) { setTenants(data); setSelectedId(data[0].id) }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const t = tenants.find((x) => x.id === selectedId)
    if (!t) return
    setTenant(t)
    setPrompt(t.prompt_agente ?? '')
    setAgentOn(t.agente_ativo && t.status !== 'bloqueado')
    const h = t.horario_funcionamento
    setHoraInicio(h?.inicio ?? '08:00')
    setHoraFim(h?.fim ?? '18:00')
    setDias(h?.dias ?? [1, 2, 3, 4, 5])
    setFuncoes(h?.funcoes ?? [])
    loadDocs(selectedId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tenants])

  const loadDocs = async (tenantId: string) => {
    const { data } = await supabase.from('knowledge_base')
      .select('id, nome_arquivo, tipo, tamanho_bytes, criado_em')
      .eq('tenant_id', tenantId).order('criado_em', { ascending: false })
    setDocs(data ?? [])
  }

  const handleToggleAgent = async () => {
    if (!tenant || tenant.status === 'bloqueado') return
    const next = !agentOn
    setAgentOn(next)
    await supabase.from('tenants').update({
      agente_ativo: next, pausado_por_admin: !next,
      agente_pausado_em: next ? null : new Date().toISOString(),
    }).eq('id', tenant.id)
    setTenants((prev) => prev.map((t) => t.id === tenant.id ? { ...t, agente_ativo: next } : t))
  }

  const handleSave = async () => {
    if (!tenant) return
    setSaving(true)
    await supabase.from('tenants').update({
      prompt_agente: prompt,
      horario_funcionamento: { inicio: horaInicio, fim: horaFim, dias, funcoes },
    }).eq('id', tenant.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files || !tenant) return
    setUploading(true)
    setErroUpload('')

    for (const file of Array.from(files)) {
      const isImagem = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      const limiteBytes = isImagem ? 5 * 1024 * 1024 : 50 * 1024 * 1024

      if (!TIPOS_ACEITOS_UPLOAD.includes(file.type)) {
        setErroUpload(`Formato não suportado: ${file.name}`)
        continue
      }
      if (file.size > limiteBytes) {
        setErroUpload(`Arquivo muito grande: ${file.name} (máx. ${isImagem ? '5MB' : '50MB'})`)
        continue
      }

      if (isImagem) {
        setUploadProgresso(`Analisando imagem: ${file.name}...`)
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        setUploadProgresso(`Extraindo texto: ${file.name}...`)
      } else {
        setUploadProgresso(`Enviando: ${file.name}...`)
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('tenant_id', tenant.id)

      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setErroUpload(data.error ?? `Erro ao enviar ${file.name}`)
      }
    }

    setUploading(false)
    setUploadProgresso('')
    loadDocs(tenant.id)
  }

  const handleDeleteDoc = async (doc: KbDoc) => {
    if (!tenant) return
    setDeletando(doc.id)
    const { error } = await supabase.from('knowledge_base').delete().eq('id', doc.id)
    if (error) {
      console.error('Erro ao deletar:', error)
      setDeletando(null)
      return
    }
    const { data: lista } = await supabase.storage.from('knowledge-base').list(tenant.id)
    const arquivo = lista?.find(f => f.name.includes(doc.nome_arquivo))
    if (arquivo) {
      await supabase.storage.from('knowledge-base').remove([`${tenant.id}/${arquivo.name}`])
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    setDeletando(null)
  }

  const toggleDia = (d: number) => setDias((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])
  const toggleFuncao = (f: string) => setFuncoes((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const inputStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  return (
    <div className="p-8 w-full">

      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Configuração
          </p>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Treinamento de Agentes
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Edite o prompt, gerencie a base de conhecimento e ajuste o comportamento do agente.
          </p>
        </div>
        <div className="relative">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            className="appearance-none text-sm font-medium pl-4 pr-9 py-2.5 rounded-lg cursor-pointer min-w-[240px] focus:outline-none transition-colors"
            style={inputStyle}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      {!agentOn && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl mb-4">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Agente desconectado pelo administrador</p>
            <p className="text-xs text-red-400/70 mt-0.5">Para reativar, entre em contato com a HubTek Solutions.</p>
          </div>
        </div>
      )}

      {tenant && (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between mb-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center font-semibold text-sm shrink-0"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10B981' }}>
              {getInitials(tenant.nome)}
            </div>
            <div>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{tenant.nome}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {tenant.slug}{tenant.expira_em && ` · expira ${fmtDate(tenant.expira_em)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                Status do agente
              </p>
              <p className={`text-sm font-semibold ${agentOn ? 'text-[#10B981]' : 'text-red-400'}`}>
                {agentOn ? '● Ativo · respondendo' : '● Pausado'}
              </p>
            </div>
            <button onClick={handleToggleAgent} disabled={tenant.status === 'bloqueado'}
              className="relative w-16 h-8 rounded-full transition-all duration-200 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: agentOn ? '#10B981' : 'rgba(239,68,68,0.15)', border: agentOn ? 'none' : '1px solid rgba(239,68,68,0.4)' }}>
              <span className="absolute top-[3px] rounded-full transition-all duration-200"
                style={{ width: 26, height: 26, left: agentOn ? 35 : 3, backgroundColor: agentOn ? '#fff' : '#EF4444' }} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">

        <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Prompt principal</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Define personalidade, regras e contexto. Use {'{empresa}'} para o nome do cliente.
              </p>
            </div>
            <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              <History size={13} /> Histórico
            </button>
          </div>

          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              Função principal do agente
            </p>
            <div className="flex flex-wrap gap-2">
              {FUNCOES.map((f) => (
                <button key={f.id} onClick={() => toggleFuncao(f.id)}
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

          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Digite aqui o prompt do agente..."
            className="w-full min-h-[420px] rounded-xl p-4 text-[12.5px] leading-relaxed font-mono resize-y focus:outline-none transition-colors"
            style={{ ...inputStyle, background: 'var(--bg-surface-2)' }}
          />

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs" style={{ color: 'var(--text-label)' }}>
              {prompt.length} caracteres · ~{Math.round(prompt.length / 4)} tokens
            </p>
            <div className="flex gap-2">
              <button onClick={() => setSelectedId((id) => id)}
                className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Descartar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] text-white rounded-lg transition-colors disabled:opacity-60">
                <CheckCircle size={13} />
                {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar configurações'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">

          <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Horário de funcionamento</p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>O agente só responde dentro deste intervalo.</p>
            <div className="flex items-center gap-2">
              <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none transition-colors"
                style={{ ...inputStyle, colorScheme: 'dark' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>até</span>
              <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none transition-colors"
                style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
            <div className="flex gap-1.5 flex-wrap mt-3">
              {DAYS_ORDER.map((d) => (
                <button key={d} onClick={() => toggleDia(d)}
                  className="w-9 h-8 rounded-lg text-[11px] font-medium border transition-all"
                  style={{
                    background: dias.includes(d) ? 'rgba(16,185,129,0.1)' : 'var(--bg-hover)',
                    borderColor: dias.includes(d) ? 'rgba(16,185,129,0.4)' : 'var(--border)',
                    color: dias.includes(d) ? '#10B981' : 'var(--text-muted)',
                  }}>
                  {DAYS[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-5 flex-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Base de conhecimento</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {docs.length} documento{docs.length !== 1 ? 's' : ''} · contexto para respostas
                </p>
              </div>
              <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] text-white rounded-lg cursor-pointer transition-colors">
                <Upload size={12} />
                {uploading ? 'Enviando...' : 'Upload'}
                <input type="file" multiple
                  accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)} />
              </label>
            </div>

            {uploading && uploadProgresso && (
              <div className="flex items-center gap-2 p-3 rounded-lg mb-3"
                style={{ background: '#10B98110', border: '1px solid #10B98130' }}>
                <div className="w-3 h-3 rounded-full border-2 border-[#10B981] border-t-transparent animate-spin flex-shrink-0" />
                <p className="text-xs text-[#10B981]">{uploadProgresso}</p>
              </div>
            )}

            {erroUpload && (
              <div className="flex items-center gap-2 p-3 rounded-lg mb-3"
                style={{ background: '#EF444410', border: '1px solid #EF444430' }}>
                <p className="text-xs text-red-400">{erroUpload}</p>
              </div>
            )}

            <div className="flex flex-col gap-2 mb-3">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2.5 p-3 rounded-xl transition-colors"
                  style={{ border: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: 'var(--bg-hover)' }}>
                    {DOC_ICON[doc.tipo] ?? '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{doc.nome_arquivo}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {fmtBytes(doc.tamanho_bytes)} · {fmtDate(doc.criado_em)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteDoc(doc)}
                    disabled={deletando === doc.id}
                    className="w-6 h-6 rounded-md flex items-center justify-center hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {deletando === doc.id
                      ? <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                      : <X size={11} />
                    }
                  </button>
                </div>
              ))}
            </div>

            <label className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:border-[#10B981] transition-colors text-center"
              style={{ border: '1px dashed var(--border-2)' }}>
              <Upload size={20} style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Arraste ou clique para upload</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-label)' }}>
                  PDF · DOCX · TXT · XLSX · JPG · PNG · WEBP
                </p>
              </div>
              <input type="file" multiple
                accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)} />
            </label>
          </div>

        </div>
      </div>
    </div>
  )
}
