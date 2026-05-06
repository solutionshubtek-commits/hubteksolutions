'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, AlertTriangle, CheckCircle2, AlertCircle,
  X, Save, Eye, EyeOff, Edit2, Lock, Unlock,
  KeyRound, BarChart2, ChevronRight, ChevronLeft,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tenant {
  id: string
  nome: string
  slug: string
  status: string
  expira_em: string | null
  criado_em: string
}

interface NovoTenant {
  nome: string
  slug: string
  email_admin: string
  senha_admin: string
  expira_em: string
  self_managed: boolean
}

interface TokenUsageRow {
  criado_em: string
  tokens_total: number
  custo_usd: number
  modelo: string
}

interface ExtratoMes {
  mes: string
  conversas: number
  mensagens: number
  tokens: number
  custo_usd: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusConfig(status: string) {
  const map: Record<string, { label: string; cor: string; bg: string; border: string }> = {
    ativo:     { label: 'Ativo',     cor: '#10B981', bg: '#10B98118', border: '#10B98140' },
    inativo:   { label: 'Inativo',   cor: '#6B6B6B', bg: '#6B6B6B18', border: '#6B6B6B40' },
    bloqueado: { label: 'Bloqueado', cor: '#EF4444', bg: '#EF444418', border: '#EF444440' },
  }
  return map[status] ?? map['inativo']
}

function diasRestantes(expira_em: string | null) {
  if (!expira_em) return null
  const diff = new Date(expira_em).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function slugify(nome: string) {
  return nome.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function Toggle({ ativo, onClick }: { ativo: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: 44, minWidth: 44, height: 24, padding: 0, border: 'none',
      outline: 'none', borderRadius: 999, position: 'relative',
      cursor: 'pointer', flexShrink: 0,
      backgroundColor: ativo ? '#10B981' : '#2A2A2A',
      transition: 'background-color 0.2s',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: ativo ? 22 : 2,
        width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff',
        transition: 'left 0.2s ease', display: 'block',
      }} />
    </button>
  )
}

function nomeMes(mes: string) {
  const [ano, m] = mes.split('-')
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${nomes[parseInt(m) - 1]}/${ano}`
}

// ─── Modal Novo Cliente ───────────────────────────────────────────────────────

function ModalNovoCliente({ onClose, onSalvo }: { onClose: () => void; onSalvo: (t: Tenant) => void }) {
  const [form, setForm] = useState<NovoTenant>({ nome: '', slug: '', email_admin: '', senha_admin: '', expira_em: '', self_managed: false })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  function handleNome(nome: string) {
    setForm(prev => ({ ...prev, nome, slug: prev.slug === slugify(prev.nome) || prev.slug === '' ? slugify(nome) : prev.slug }))
  }

  async function handleSalvar() {
    if (!form.nome || !form.slug || !form.email_admin || !form.senha_admin || !form.expira_em) {
      setErro('Preencha todos os campos obrigatórios.'); return
    }
    setSalvando(true); setErro('')
    const supabase = createClient()
    const { data: slugExiste } = await supabase.from('tenants').select('id').eq('slug', form.slug).single()
    if (slugExiste) { setErro('Esse slug já está em uso.'); setSalvando(false); return }
    const { data: tenant, error: tenantErr } = await supabase.from('tenants').insert({ nome: form.nome, slug: form.slug, status: 'ativo', expira_em: form.expira_em }).select().single()
    if (tenantErr || !tenant) { setErro('Erro ao criar tenant: ' + (tenantErr?.message ?? 'desconhecido')); setSalvando(false); return }
    const res = await fetch('/api/admin/criar-usuario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email_admin, senha: form.senha_admin, tenant_id: tenant.id, role: form.self_managed ? 'self_managed' : 'admin_tenant', nome: form.nome }) })
    const resData = await res.json()
    if (!res.ok) { await supabase.from('tenants').delete().eq('id', tenant.id); setErro('Erro ao criar usuário: ' + (resData.error ?? 'desconhecido')); setSalvando(false); return }
    setSalvando(false); onSalvo(tenant)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <h2 className="text-white font-semibold">Cadastrar novo cliente</h2>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Nome da empresa *</label><input type="text" value={form.nome} onChange={(e) => handleNome(e.target.value)} placeholder="Ex: Pizzaria Vesúvio" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]" /></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Slug *</label><input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="pizzaria-vesuvio" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981] font-mono" /></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">E-mail do admin *</label><input type="email" value={form.email_admin} onChange={(e) => setForm({ ...form, email_admin: e.target.value })} placeholder="cliente@empresa.com" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]" /></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Senha inicial *</label>
            <div className="relative">
              <input type={mostrarSenha ? 'text' : 'password'} value={form.senha_admin} onChange={(e) => setForm({ ...form, senha_admin: e.target.value })} placeholder="Mínimo 8 caracteres" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#10B981]" />
              <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-white">{mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </div>
          </div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Data de expiração *</label><input type="date" value={form.expira_em} onChange={(e) => setForm({ ...form, expira_em: e.target.value })} className="w-full bg-[#050505] border border-[#1F1F1F] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981] [color-scheme:dark]" /></div>
          <div className="flex items-center justify-between bg-[#050505] border border-[#1F1F1F] rounded-lg px-4 py-3">
            <div><p className="text-white text-sm font-medium">Permitir autogestão do agente</p><p className="text-[#6B6B6B] text-xs mt-0.5">Cliente poderá editar prompt, horários e base de conhecimento</p></div>
            <Toggle ativo={form.self_managed} onClick={() => setForm(prev => ({ ...prev, self_managed: !prev.self_managed }))} />
          </div>
          {erro && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400 flex-shrink-0" /><p className="text-red-400 text-sm">{erro}</p></div>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1F1F1F]">
          <button onClick={onClose} className="text-[#A3A3A3] hover:text-white text-sm font-medium px-4 py-2 rounded-lg">Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando} className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg"><Save size={14} />{salvando ? 'Salvando...' : 'Cadastrar cliente'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Painel Lateral (Slide-over) ──────────────────────────────────────────────

function PainelCliente({
  tenant,
  onClose,
  onAtualizar,
}: {
  tenant: Tenant
  onClose: () => void
  onAtualizar: (t: Tenant) => void
}) {
  const [aba, setAba] = useState<'detalhes' | 'editar' | 'senha' | 'extrato'>('detalhes')

  // Editar
  const [formEditar, setFormEditar] = useState({ nome: tenant.nome, expira_em: tenant.expira_em?.split('T')[0] ?? '' })
  const [salvandoEditar, setSalvandoEditar] = useState(false)
  const [erroEditar, setErroEditar] = useState('')

  // Senha
  const [novaSenha, setNovaSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState('')
  const [senhaSucesso, setSenhaSucesso] = useState(false)

  // Extrato
  const [extrato, setExtrato] = useState<ExtratoMes[]>([])
  const [detalhe, setDetalhe] = useState<TokenUsageRow[] | null>(null)
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null)
  const [carregandoExtrato, setCarregandoExtrato] = useState(false)

  // Status local
  const [statusAtual, setStatusAtual] = useState(tenant.status)

  const cfg = statusConfig(statusAtual)
  const dias = diasRestantes(tenant.expira_em)
  const expirando = dias !== null && dias <= 10 && dias >= 0
  const expirado = dias !== null && dias < 0

  // ── Editar ──
  async function handleSalvarEditar() {
    if (!formEditar.nome || !formEditar.expira_em) { setErroEditar('Preencha todos os campos.'); return }
    setSalvandoEditar(true); setErroEditar('')
    const supabase = createClient()
    const { error } = await supabase.from('tenants').update({ nome: formEditar.nome, expira_em: formEditar.expira_em }).eq('id', tenant.id)
    setSalvandoEditar(false)
    if (error) { setErroEditar('Erro: ' + error.message); return }
    onAtualizar({ ...tenant, nome: formEditar.nome, expira_em: formEditar.expira_em, status: statusAtual })
    setAba('detalhes')
  }

  // ── Bloquear/Desbloquear ──
  async function handleToggleStatus() {
    const novoStatus = statusAtual === 'bloqueado' ? 'ativo' : 'bloqueado'
    const supabase = createClient()
    await supabase.from('tenants').update({ status: novoStatus }).eq('id', tenant.id)
    setStatusAtual(novoStatus)
    onAtualizar({ ...tenant, status: novoStatus })
  }

  // ── Resetar senha ──
  async function handleResetar() {
    if (novaSenha.length < 8) { setErroSenha('Mínimo 8 caracteres.'); return }
    setSalvandoSenha(true); setErroSenha('')
    const res = await fetch('/api/admin/resetar-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant_id: tenant.id, nova_senha: novaSenha }) })
    const data = await res.json()
    setSalvandoSenha(false)
    if (!res.ok) { setErroSenha(data.error ?? 'Erro desconhecido'); return }
    setSenhaSucesso(true)
  }

  // ── Extrato ──
  async function fetchExtrato() {
    setCarregandoExtrato(true)
    const supabase = createClient()
    const { data: rows } = await supabase.from('token_usage').select('criado_em, tokens_total, custo_usd, modelo').eq('tenant_id', tenant.id).order('criado_em', { ascending: false })
    if (!rows || rows.length === 0) { setCarregandoExtrato(false); return }
    const porMes: Record<string, { tokens: number; custo_usd: number }> = {}
    rows.forEach(r => {
      const mes = r.criado_em.slice(0, 7)
      if (!porMes[mes]) porMes[mes] = { tokens: 0, custo_usd: 0 }
      porMes[mes].tokens += r.tokens_total
      porMes[mes].custo_usd += r.custo_usd
    })
    const meses = Object.keys(porMes).sort().reverse()
    const extratoFinal: ExtratoMes[] = await Promise.all(meses.map(async mes => {
      const inicio = `${mes}-01T00:00:00.000Z`
      const fim = new Date(new Date(inicio).setMonth(new Date(inicio).getMonth() + 1)).toISOString()
      const [convRes, msgRes] = await Promise.all([
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('criado_em', inicio).lt('criado_em', fim),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('criado_em', inicio).lt('criado_em', fim),
      ])
      return { mes, conversas: convRes.count ?? 0, mensagens: msgRes.count ?? 0, tokens: porMes[mes].tokens, custo_usd: porMes[mes].custo_usd }
    }))
    setExtrato(extratoFinal)
    setCarregandoExtrato(false)
  }

  async function fetchDetalhe(mes: string) {
    setMesSelecionado(mes)
    const supabase = createClient()
    const inicio = `${mes}-01T00:00:00.000Z`
    const fim = new Date(new Date(inicio).setMonth(new Date(inicio).getMonth() + 1)).toISOString()
    const { data } = await supabase.from('token_usage').select('criado_em, tokens_total, custo_usd, modelo').eq('tenant_id', tenant.id).gte('criado_em', inicio).lt('criado_em', fim).order('criado_em', { ascending: false })
    setDetalhe(data ?? [])
  }

  useEffect(() => { if (aba === 'extrato') fetchExtrato() }, [aba])

  const abas = [
    { key: 'detalhes', label: 'Detalhes', icon: null },
    { key: 'editar',   label: 'Editar',   icon: Edit2 },
    { key: 'senha',    label: 'Senha',    icon: KeyRound },
    { key: 'extrato',  label: 'Extrato',  icon: BarChart2 },
  ] as const

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Painel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-[#0A0A0A] border-l border-[#1F1F1F] z-50 flex flex-col shadow-2xl">

        {/* Header do painel */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1F1F1F] flex items-center justify-center text-[#A3A3A3] text-sm font-semibold">
              {tenant.nome.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{tenant.nome}</p>
              <p className="text-[#6B6B6B] text-xs font-mono">{tenant.slug}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-[#1F1F1F] px-4">
          {abas.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                aba === key ? 'border-[#10B981] text-[#10B981]' : 'border-transparent text-[#6B6B6B] hover:text-white'
              }`}
            >
              {Icon && <Icon size={13} />}
              {label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Detalhes ── */}
          {aba === 'detalhes' && (
            <div className="space-y-5">
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border" style={{ color: cfg.cor, background: cfg.bg, borderColor: cfg.border }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.cor }} />
                  {cfg.label}
                </span>
                {expirando && <span className="flex items-center gap-1 text-[#F59E0B] text-xs"><AlertTriangle size={11} /> Expira em {dias}d</span>}
                {expirado && <span className="flex items-center gap-1 text-red-400 text-xs"><AlertTriangle size={11} /> Acesso expirado</span>}
              </div>

              {/* Dados */}
              {[
                { label: 'Nome', value: tenant.nome },
                { label: 'Slug', value: tenant.slug, mono: true },
                { label: 'Cadastro', value: new Date(tenant.criado_em).toLocaleDateString('pt-BR') },
                { label: 'Expiração', value: tenant.expira_em ? new Date(tenant.expira_em).toLocaleDateString('pt-BR') : '—' },
              ].map(({ label, value, mono }) => (
                <div key={label} className="bg-[#050505] border border-[#1F1F1F] rounded-lg px-4 py-3">
                  <p className="text-[#6B6B6B] text-xs mb-1">{label}</p>
                  <p className={`text-white text-sm ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
                </div>
              ))}

              {/* Ação rápida — bloquear/desbloquear */}
              <button
                onClick={handleToggleStatus}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  statusAtual === 'bloqueado'
                    ? 'bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/20'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                }`}
              >
                {statusAtual === 'bloqueado' ? <><Unlock size={14} /> Desbloquear acesso</> : <><Lock size={14} /> Bloquear acesso</>}
              </button>
            </div>
          )}

          {/* ── Editar ── */}
          {aba === 'editar' && (
            <div className="space-y-4">
              <div>
                <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Nome da empresa</label>
                <input type="text" value={formEditar.nome} onChange={(e) => setFormEditar({ ...formEditar, nome: e.target.value })} className="w-full bg-[#050505] border border-[#1F1F1F] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]" />
              </div>
              <div>
                <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Slug</label>
                <input type="text" value={tenant.slug} disabled className="w-full bg-[#050505] border border-[#1F1F1F] text-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm cursor-not-allowed font-mono" />
                <p className="text-[#3A3A3A] text-xs mt-1">O slug não pode ser alterado.</p>
              </div>
              <div>
                <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Data de expiração</label>
                <input type="date" value={formEditar.expira_em} onChange={(e) => setFormEditar({ ...formEditar, expira_em: e.target.value })} className="w-full bg-[#050505] border border-[#1F1F1F] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981] [color-scheme:dark]" />
              </div>
              {erroEditar && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400 flex-shrink-0" /><p className="text-red-400 text-sm">{erroEditar}</p></div>}
              <button onClick={handleSalvarEditar} disabled={salvandoEditar} className="w-full flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                <Save size={14} />{salvandoEditar ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}

          {/* ── Senha ── */}
          {aba === 'senha' && (
            <div className="space-y-4">
              <p className="text-[#A3A3A3] text-sm">Define uma nova senha para o administrador deste cliente.</p>
              {senhaSucesso ? (
                <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-4 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#10B981]" />
                  <p className="text-[#10B981] text-sm font-medium">Senha alterada com sucesso!</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Nova senha</label>
                    <div className="relative">
                      <input type={mostrarSenha ? 'text' : 'password'} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo 8 caracteres" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#10B981]" />
                      <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-white">{mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                    </div>
                  </div>
                  {erroSenha && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400 flex-shrink-0" /><p className="text-red-400 text-sm">{erroSenha}</p></div>}
                  <button onClick={handleResetar} disabled={salvandoSenha} className="w-full flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                    <KeyRound size={14} />{salvandoSenha ? 'Alterando...' : 'Alterar senha'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Extrato ── */}
          {aba === 'extrato' && (
            <div>
              {mesSelecionado && (
                <button onClick={() => { setMesSelecionado(null); setDetalhe(null) }} className="flex items-center gap-1 text-[#6B6B6B] hover:text-white text-sm mb-4 transition-colors">
                  <ChevronLeft size={15} /> Voltar
                </button>
              )}
              {carregandoExtrato ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-[#050505] rounded-xl animate-pulse" />)}</div>
              ) : mesSelecionado && detalhe ? (
                <div className="space-y-2">
                  <p className="text-white font-semibold mb-3">{nomeMes(mesSelecionado)} — detalhamento</p>
                  {detalhe.length === 0 ? (
                    <p className="text-[#6B6B6B] text-sm">Nenhum detalhe disponível.</p>
                  ) : detalhe.map((row, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#050505] border border-[#1F1F1F] rounded-lg px-4 py-3">
                      <div>
                        <p className="text-white text-sm">{new Date(row.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-[#6B6B6B] text-xs font-mono">{row.modelo}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white text-sm font-medium">{row.tokens_total.toLocaleString('pt-BR')} tokens</p>
                        <p className="text-[#6B6B6B] text-xs">US$ {row.custo_usd.toFixed(6)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : extrato.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart2 size={32} className="text-[#3A3A3A] mx-auto mb-3" />
                  <p className="text-[#6B6B6B] text-sm">Nenhum dado de token ainda.</p>
                  <p className="text-[#3A3A3A] text-xs mt-1">Os dados aparecem conforme o agente for utilizado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {extrato.map(e => {
                    const custoReais = e.custo_usd * 5.8
                    const valorCobrar = custoReais * 3
                    return (
                      <div key={e.mes} className="bg-[#050505] border border-[#1F1F1F] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-white font-semibold">{nomeMes(e.mes)}</span>
                          <button onClick={() => fetchDetalhe(e.mes)} className="flex items-center gap-1 text-[#10B981] text-xs hover:underline">
                            Detalhes <ChevronRight size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div><p className="text-[#6B6B6B] text-xs mb-0.5">Conversas</p><p className="text-white font-medium">{e.conversas}</p></div>
                          <div><p className="text-[#6B6B6B] text-xs mb-0.5">Mensagens</p><p className="text-white font-medium">{e.mensagens}</p></div>
                          <div><p className="text-[#6B6B6B] text-xs mb-0.5">Tokens</p><p className="text-white font-medium">{e.tokens.toLocaleString('pt-BR')}</p></div>
                          <div><p className="text-[#6B6B6B] text-xs mb-0.5">Custo API</p><p className="text-white font-medium">R$ {custoReais.toFixed(2)}</p></div>
                        </div>
                        <div className="pt-3 border-t border-[#1F1F1F] flex items-center justify-between">
                          <div>
                            <p className="text-[#6B6B6B] text-xs">Margem sugerida (3x)</p>
                            <p className="text-[#A3A3A3] text-xs">Sua margem: R$ {(valorCobrar - custoReais).toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[#6B6B6B] text-xs mb-0.5">Valor a cobrar</p>
                            <p className="text-[#10B981] text-lg font-bold">R$ {valorCobrar.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminClientesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<Tenant | null>(null)
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    async function fetchTenants() {
      const supabase = createClient()
      const { data } = await supabase.from('tenants').select('id, nome, slug, status, expira_em, criado_em').order('criado_em', { ascending: false })
      setTenants(data ?? [])
      setCarregando(false)
    }
    fetchTenants()
  }, [])

  function mostrarSucesso(msg: string) {
    setSucesso(msg)
    setTimeout(() => setSucesso(''), 4000)
  }

  function handleSalvoNovo(tenant: Tenant) {
    setTenants(prev => [tenant, ...prev])
    setModalNovo(false)
    mostrarSucesso(`Cliente "${tenant.nome}" cadastrado com sucesso!`)
  }

  function handleAtualizar(tenant: Tenant) {
    setTenants(prev => prev.map(t => t.id === tenant.id ? tenant : t))
    setClienteSelecionado(tenant)
  }

  const tenantsFiltrados = tenants.filter(t =>
    t.nome.toLowerCase().includes(busca.toLowerCase()) ||
    t.slug.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[#6B6B6B] text-sm mb-1">Gestão</p>
          <h1 className="text-white text-2xl font-bold">Clientes</h1>
          <p className="text-[#A3A3A3] text-sm mt-1">{tenants.length} contas cadastradas.</p>
        </div>
        <button onClick={() => setModalNovo(true)} className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={15} /> Cadastrar cliente
        </button>
      </div>

      {sucesso && (
        <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2 mb-6">
          <CheckCircle2 size={14} className="text-[#10B981]" />
          <p className="text-[#10B981] text-sm">{sucesso}</p>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
        <input type="text" placeholder="Buscar por nome ou slug..." value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full bg-[#0A0A0A] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]" />
      </div>

      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl overflow-hidden">
        {carregando ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-[#050505] rounded-lg animate-pulse" />)}</div>
        ) : tenantsFiltrados.length === 0 ? (
          <div className="p-12 text-center"><p className="text-[#6B6B6B] text-sm">Nenhum cliente encontrado.</p></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1F1F1F]">
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-5 py-3 uppercase tracking-wider">Cliente</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-5 py-3 uppercase tracking-wider">Status</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-5 py-3 uppercase tracking-wider">Expiração</th>
                <th className="text-left text-[#6B6B6B] text-xs font-medium px-5 py-3 uppercase tracking-wider">Cadastro</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {tenantsFiltrados.map((t) => {
                const cfg = statusConfig(t.status)
                const dias = diasRestantes(t.expira_em)
                const expirando = dias !== null && dias <= 10 && dias >= 0
                const bloqueado = dias !== null && dias < 0
                const selecionado = clienteSelecionado?.id === t.id
                return (
                  <tr
                    key={t.id}
                    onClick={() => setClienteSelecionado(t)}
                    className={`border-b border-[#1F1F1F] last:border-0 cursor-pointer transition-colors ${selecionado ? 'bg-[#10B981]/5 border-l-2 border-l-[#10B981]' : 'hover:bg-[#141414]'}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#1F1F1F] flex items-center justify-center text-[#A3A3A3] text-xs font-semibold flex-shrink-0">
                          {t.nome.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{t.nome}</p>
                          <p className="text-[#6B6B6B] text-xs font-mono">{t.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border" style={{ color: cfg.cor, background: cfg.bg, borderColor: cfg.border }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.cor }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {t.expira_em ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[#A3A3A3] text-sm">{new Date(t.expira_em).toLocaleDateString('pt-BR')}</span>
                          {bloqueado && <span className="flex items-center gap-1 text-red-400 text-xs"><AlertTriangle size={11} /> Expirado</span>}
                          {expirando && !bloqueado && <span className="flex items-center gap-1 text-[#F59E0B] text-xs"><AlertTriangle size={11} /> {dias}d</span>}
                        </div>
                      ) : <span className="text-[#3A3A3A] text-sm">—</span>}
                    </td>
                    <td className="px-5 py-4"><span className="text-[#6B6B6B] text-sm">{new Date(t.criado_em).toLocaleDateString('pt-BR')}</span></td>
                    <td className="px-5 py-4 text-right"><ChevronRight size={15} className="text-[#3A3A3A]" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalNovo && <ModalNovoCliente onClose={() => setModalNovo(false)} onSalvo={handleSalvoNovo} />}
      {clienteSelecionado && (
        <PainelCliente
          tenant={clienteSelecionado}
          onClose={() => setClienteSelecionado(null)}
          onAtualizar={handleAtualizar}
        />
      )}
    </div>
  )
}
