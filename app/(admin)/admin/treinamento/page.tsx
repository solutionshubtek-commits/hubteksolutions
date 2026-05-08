'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  History, CheckCircle, Upload, X, Settings,
  AlertTriangle, ChevronDown,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tenant {
  id: string
  nome: string
  slug: string
  status: string
  expira_em: string | null
  agente_ativo: boolean
  agente_pausado_em: string | null
  prompt_agente: string | null
  horario_funcionamento: HorarioFuncionamento | null
  mensagem_fora_horario: string | null
}

interface HorarioFuncionamento {
  inicio: string
  fim: string
  dias: number[] // 0=Dom 1=Seg ... 6=Sab
  funcoes?: string[]
}

interface KbDoc {
  id: string
  nome_arquivo: string
  tipo: string
  tamanho_bytes: number
  criado_em: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0] // Seg→Dom display order

const FUNCOES = [
  { id: 'agendamentos', label: '📅 Agendamentos' },
  { id: 'suporte',      label: '💬 Suporte' },
  { id: 'vendas',       label: '🛒 Vendas' },
  { id: 'leads',        label: '🎯 Qualif. de Lead' },
]

const DOC_ICON: Record<string, string> = {
  pdf: '📄', docx: '📝', doc: '📝', txt: '📃', xlsx: '📊', xls: '📊',
}

function fmtBytes(b: number) {
  if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + ' MB'
  if (b >= 1024) return Math.round(b / 1024) + ' KB'
  return b + ' B'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()
}

// ─── Component ───────────────────────────────────────────────────────────────

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

  // Editable fields
  const [prompt, setPrompt] = useState('')
  const [funcoes, setFuncoes] = useState<string[]>([])
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFim, setHoraFim] = useState('18:00')
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5])
  const [agentOn, setAgentOn] = useState(true)

  // ── Load tenant list ──────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, nome, slug, status, expira_em, agente_ativo, agente_pausado_em, prompt_agente, horario_funcionamento, mensagem_fora_horario')
        .order('nome')
      if (data && data.length > 0) {
        setTenants(data)
        setSelectedId(data[0].id)
      }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load selected tenant data ─────────────────────────────────────────────

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
    const { data } = await supabase
      .from('knowledge_base')
      .select('id, nome_arquivo, tipo, tamanho_bytes, criado_em')
      .eq('tenant_id', tenantId)
      .order('criado_em', { ascending: false })
    setDocs(data ?? [])
  }

  // ── Toggle agent ──────────────────────────────────────────────────────────

  const handleToggleAgent = async () => {
    if (!tenant || tenant.status === 'bloqueado') return
    const next = !agentOn
    setAgentOn(next)
    await supabase
      .from('tenants')
      .update({
        agente_ativo: next,
        pausado_por_admin: !next,
        agente_pausado_em: next ? null : new Date().toISOString(),
      })
      .eq('id', tenant.id)
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenant.id ? { ...t, agente_ativo: next } : t
      )
    )
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!tenant) return
    setSaving(true)
    const horario: HorarioFuncionamento = {
      inicio: horaInicio,
      fim: horaFim,
      dias,
      funcoes,
    }
    await supabase
      .from('tenants')
      .update({
        prompt_agente: prompt,
        horario_funcionamento: horario,
      })
      .eq('id', tenant.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async (files: FileList | null) => {
    if (!files || !tenant) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const allowed = ['pdf', 'docx', 'doc', 'txt', 'xlsx', 'xls']
      if (!allowed.includes(ext)) continue
      if (file.size > 50 * 1024 * 1024) continue

      const path = `${tenant.id}/${Date.now()}_${file.name}`

      const { error: storageErr } = await supabase.storage
        .from('knowledge-base')
        .upload(path, file)

      if (storageErr) continue

      // Read text for txt files; otherwise store path reference
      let conteudo_texto: string | null = null
      if (ext === 'txt') {
        conteudo_texto = await file.text()
      }

      await supabase.from('knowledge_base').insert({
        tenant_id: tenant.id,
        nome_arquivo: file.name,
        tipo: ext,
        conteudo_texto,
        tamanho_bytes: file.size,
      })
    }

    setUploading(false)
    loadDocs(tenant.id)
  }

  // ── Delete doc ────────────────────────────────────────────────────────────

  const handleDeleteDoc = async (doc: KbDoc) => {
    if (!tenant) return
    await supabase.from('knowledge_base').delete().eq('id', doc.id)
    setDocs((prev) => prev.filter((d) => d.id !== doc.id))
  }

  // ── Toggle dia ────────────────────────────────────────────────────────────

  const toggleDia = (d: number) => {
    setDias((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    )
  }

  const toggleFuncao = (f: string) => {
    setFuncoes((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const adminDisconnected = !agentOn

  return (
    <div className="p-8 w-full">

      {/* ── Page head ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-1">
            Configuração
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Treinamento de Agentes
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Edite o prompt, gerencie a base de conhecimento e ajuste o comportamento do agente.
          </p>
        </div>

        {/* Client selector */}
        <div className="relative">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="appearance-none bg-neutral-900 border border-neutral-800 text-white text-sm font-medium
                       pl-4 pr-9 py-2.5 rounded-lg cursor-pointer min-w-[240px]
                       focus:outline-none focus:border-emerald-500
                       hover:border-neutral-700 transition-colors"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        </div>
      </div>

      {/* ── Admin disconnected banner ── */}
      {adminDisconnected && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl mb-4">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">
              Agente desconectado pelo administrador
            </p>
            <p className="text-xs text-red-400/70 mt-0.5">
              Para reativar, entre em contato com a HubTek Solutions.
            </p>
          </div>
        </div>
      )}

      {/* ── Client status bar ── */}
      {tenant && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-4 flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 font-semibold text-sm shrink-0">
              {getInitials(tenant.nome)}
            </div>
            <div>
              <p className="text-[15px] font-semibold text-white">{tenant.nome}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {tenant.slug}
                {tenant.expira_em && ` · expira ${fmtDate(tenant.expira_em)}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest mb-1">
                Status do agente
              </p>
              <p className={`text-sm font-semibold ${agentOn ? 'text-emerald-400' : 'text-red-400'}`}>
                {agentOn ? '● Ativo · respondendo' : '● Pausado'}
              </p>
            </div>
            <button
              onClick={handleToggleAgent}
              disabled={tenant.status === 'bloqueado'}
              className={`relative w-16 h-8 rounded-full transition-all duration-200 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed
                ${agentOn
                  ? 'bg-emerald-500'
                  : 'bg-red-500/15 border border-red-500/40'
                }`}
            >
              <span className={`absolute top-[3px] w-[26px] h-[26px] rounded-full transition-all duration-200
                ${agentOn ? 'left-[35px] bg-white' : 'left-[3px] bg-red-500'}`}
              />
            </button>
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-[2fr_1fr] gap-4">

        {/* Left: Prompt editor */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-white">Prompt principal</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Define personalidade, regras e contexto. Use {'{empresa}'} para o nome do cliente.
              </p>
            </div>
            <button className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700 px-3 py-1.5 rounded-lg transition-colors">
              <History size={13} /> Histórico
            </button>
          </div>

          {/* Funções */}
          <div>
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest mb-2">
              Função principal do agente
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {FUNCOES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => toggleFuncao(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                    ${funcoes.includes(f.id)
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-neutral-800/50 border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-700'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value) }}
            placeholder="Digite aqui o prompt do agente..."
            className="w-full min-h-[420px] bg-neutral-950 border border-neutral-800 rounded-xl p-4
                       text-white text-[12.5px] leading-relaxed font-mono resize-y
                       focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20
                       placeholder:text-neutral-600 transition-colors"
          />

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-neutral-600">
              {prompt.length} caracteres · ~{Math.round(prompt.length / 4)} tokens
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedId((id) => id)}
                className="px-4 py-2 text-xs font-semibold text-neutral-400 border border-neutral-800 rounded-lg hover:text-white hover:border-neutral-700 transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-60"
              >
                <CheckCircle size={13} />
                {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar configurações'}
              </button>
            </div>
          </div>
        </div>

        {/* Right col */}
        <div className="flex flex-col gap-4">

          {/* Horário */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <p className="text-sm font-semibold text-white mb-0.5">Horário de funcionamento</p>
            <p className="text-xs text-neutral-500 mb-4">O agente só responde dentro deste intervalo.</p>

            <div className="flex items-center gap-2">
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => { setHoraInicio(e.target.value) }}
                className="flex-1 bg-neutral-950 border border-neutral-800 text-white text-xs font-mono
                           px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                style={{ colorScheme: 'dark' }}
              />
              <span className="text-xs text-neutral-500">até</span>
              <input
                type="time"
                value={horaFim}
                onChange={(e) => { setHoraFim(e.target.value) }}
                className="flex-1 bg-neutral-950 border border-neutral-800 text-white text-xs font-mono
                           px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                style={{ colorScheme: 'dark' }}
              />
            </div>

            <div className="flex gap-1.5 flex-wrap mt-3">
              {DAYS_ORDER.map((d) => (
                <button
                  key={d}
                  onClick={() => toggleDia(d)}
                  className={`w-9 h-8 rounded-lg text-[11px] font-medium border transition-all
                    ${dias.includes(d)
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-neutral-800/50 border-neutral-800 text-neutral-500 hover:text-white'
                    }`}
                >
                  {DAYS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Knowledge base */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex-1">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-white mb-0.5">Base de conhecimento</p>
                <p className="text-xs text-neutral-500">
                  {docs.length} documento{docs.length !== 1 ? 's' : ''} · contexto para respostas
                </p>
              </div>
              <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg cursor-pointer transition-colors">
                <Upload size={12} />
                {uploading ? 'Enviando...' : 'Upload'}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </label>
            </div>

            {/* Doc list */}
            <div className="flex flex-col gap-2 mb-3">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-neutral-800 bg-neutral-950/50 hover:border-neutral-700 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-sm shrink-0">
                    {DOC_ICON[doc.tipo] ?? '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{doc.nome_arquivo}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {fmtBytes(doc.tamanho_bytes)} · {fmtDate(doc.criado_em)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="w-6 h-6 rounded-md border border-neutral-800 flex items-center justify-center text-neutral-500 hover:text-white hover:border-neutral-700 transition-colors">
                      <Settings size={11} />
                    </button>
                    <button
                      onClick={() => handleDeleteDoc(doc)}
                      className="w-6 h-6 rounded-md border border-neutral-800 flex items-center justify-center text-neutral-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Upload zone */}
            <label className="flex flex-col items-center gap-2 p-4 border border-dashed border-neutral-700 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors text-center">
              <Upload size={20} className="text-neutral-500" />
              <div>
                <p className="text-xs font-semibold text-neutral-400">Arraste ou clique para upload</p>
                <p className="text-[10px] text-neutral-600 mt-0.5">PDF · DOCX · TXT · XLSX · até 50 MB</p>
              </div>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </label>
          </div>

        </div>
      </div>
    </div>
  )
}