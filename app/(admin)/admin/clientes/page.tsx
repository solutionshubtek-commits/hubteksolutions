'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, AlertTriangle, CheckCircle2, AlertCircle,
  MoreVertical, X, Save, Eye, EyeOff, Edit2, Lock, Unlock,
  KeyRound, BarChart2, ChevronLeft, ChevronRight,
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
      setErro('Preencha todos os campos obrigatórios.')
      return
    }
    setSalvando(true)
    setErro('')
    const supabase = createClient()
    const { data: slugExiste } = await supabase.from('tenants').select('id').eq('slug', form.slug).single()
    if (slugExiste) { setErro('Esse slug já está em uso.'); setSalvando(false); return }
    const { data: tenant, error: tenantErr } = await supabase.from('tenants').insert({ nome: form.nome, slug: form.slug, status: 'ativo', expira_em: form.expira_em }).select().single()
    if (tenantErr || !tenant) { setErro('Erro ao criar tenant: ' + (tenantErr?.message ?? 'desconhecido')); setSalvando(false); return }
    const res = await fetch('/api/admin/criar-usuario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email_admin, senha: form.senha_admin, tenant_id: tenant.id, role: form.self_managed ? 'self_managed' : 'admin_tenant', nome: form.nome }) })
    const resData = await res.json()
    if (!res.ok) { await supabase.from('tenants').delete().eq('id', tenant.id); setErro('Erro ao criar usuário: ' + (resData.error ?? 'desconhecido')); setSalvando(false); return }
    setSalvando(false)
    onSalvo(tenant)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <h2 className="text-white font-semibold">Cadastrar novo cliente</h2>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Nome da empresa *</label><input type="text" value={form.nome} onChange={(e) => handleNome(e.target.value)} placeholder="Ex: Pizzaria Vesúvio" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]" /></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Slug *</label><input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="pizzaria-vesuvio" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981] font-mono" /></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">E-mail do admin *</label><input type="email" value={form.email_admin} onChange={(e) => setForm({ ...form, email_admin: e.target.value })} placeholder="cliente@empresa.com" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]" /></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Senha inicial *</label><div className="relative"><input type={mostrarSenha ? 'text' : 'password'} value={form.senha_admin} onChange={(e) => setForm({ ...form, senha_admin: e.target.value })} placeholder="Mínimo 8 caracteres" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#10B981]" /><button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-white">{mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Data de expiração *</label><input type="date" value={form.expira_em} onChange={(e) => setForm({ ...form, expira_em: e.target.value })} className="w-full bg-[#050505] border border-[#1F1F1F] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981] [color-scheme:dark]" /></div>
          <div className="flex items-center justify-between bg-[#050505] border border-[#1F1F1F] rounded-lg px-4 py-3">
            <div><p className="text-white text-sm font-medium">Permitir autogestão do agente</p><p className="text-[#6B6B6B] text-xs mt-0.5">Cliente poderá editar prompt, horários e base de conhecimento</p></div>
            <Toggle ativo={form.self_managed} onClick={() => setForm(prev => ({ ...prev, self_managed: !prev.self_managed }))} />
          </div>
          {erro && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400 flex-shrink-0" /><p className="text-red-400 text-sm">{erro}</p></div>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1F1F1F]">
          <button onClick={onClose} className="text-[#A3A3A3] hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando} className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"><Save size={14} />{salvando ? 'Salvando...' : 'Cadastrar cliente'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Editar Cliente ─────────────────────────────────────────────────────

function ModalEditar({ tenant, onClose, onSalvo }: { tenant: Tenant; onClose: () => void; onSalvo: (t: Tenant) => void }) {
  const [form, setForm] = useState({ nome: tenant.nome, expira_em: tenant.expira_em?.split('T')[0] ?? '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSalvar() {
    if (!form.nome || !form.expira_em) { setErro('Preencha todos os campos.'); return }
    setSalvando(true)
    const supabase = createClient()
    const { error } = await supabase.from('tenants').update({ nome: form.nome, expira_em: form.expira_em }).eq('id', tenant.id)
    setSalvando(false)
    if (error) { setErro('Erro ao salvar: ' + error.message); return }
    onSalvo({ ...tenant, nome: form.nome, expira_em: form.expira_em })
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <h2 className="text-white font-semibold">Editar cliente</h2>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Nome da empresa</label><input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full bg-[#050505] border border-[#1F1F1F] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]" /></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Slug</label><input type="text" value={tenant.slug} disabled className="w-full bg-[#050505] border border-[#1F1F1F] text-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm cursor-not-allowed font-mono" /></div>
          <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Data de expiração</label><input type="date" value={form.expira_em} onChange={(e) => setForm({ ...form, expira_em: e.target.value })} className="w-full bg-[#050505] border border-[#1F1F1F] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981] [color-scheme:dark]" /></div>
          {erro && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400 flex-shrink-0" /><p className="text-red-400 text-sm">{erro}</p></div>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1F1F1F]">
          <button onClick={onClose} className="text-[#A3A3A3] hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando} className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"><Save size={14} />{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Resetar Senha ──────────────────────────────────────────────────────

function ModalResetarSenha({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [novaSenha, setNovaSenha] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')

  async function handleResetar() {
    if (novaSenha.length < 8) { setErro('Mínimo 8 caracteres.'); return }
    setSalvando(true)
    setErro('')
    const res = await fetch('/api/admin/resetar-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant_id: tenant.id, nova_senha: novaSenha }) })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(data.error ?? 'Erro desconhecido'); return }
    setSucesso(true)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <h2 className="text-white font-semibold">Resetar senha — {tenant.nome}</h2>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {sucesso ? (
            <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-4 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[#10B981]" />
              <p className="text-[#10B981] text-sm font-medium">Senha alterada com sucesso!</p>
            </div>
          ) : (
            <>
              <div><label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Nova senha</label><div className="relative"><input type={mostrar ? 'text' : 'password'} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo 8 caracteres" className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#10B981]" /><button type="button" onClick={() => setMostrar(!mostrar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-white">{mostrar ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
              {erro && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400 flex-shrink-0" /><p className="text-red-400 text-sm">{erro}</p></div>}
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1F1F1F]">
          <button onClick={onClose} className="text-[#A3A3A3] hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Fechar</button>
          {!sucesso && <button onClick={handleResetar} disabled={salvando} className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"><KeyRound size={14} />{salvando ? 'Alterando...' : 'Alterar senha'}</button>}
        </div>
      </div>
    </div>
  )
}

// ─── Modal Extrato de Tokens ──────────────────────────────────────────────────

function ModalExtrato({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [extrato, setExtrato] = useState<ExtratoMes[]>([])
  const [detalhe, setDetalhe] = useState<TokenUsageRow[]>([])
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const MARGEM = 3 // multiplicador sugerido

  useEffect(() => {
    async function fetchExtrato() {
      const supabase = createClient()

      // Busca uso de tokens agrupado por mês
      const { data: rows } = await supabase
        .from('token_usage')
        .select('criado_em, tokens_total, custo_usd, modelo')
        .eq('tenant_id', tenant.id)
        .order('criado_em', { ascending: false })

      if (!rows || rows.length === 0) { setCarregando(false); return }

      // Agrupar por mês
      const porMes: Record<string, { tokens: number; custo_usd: number; rows: TokenUsageRow[] }> = {}
      rows.forEach(r => {
        const mes = r.criado_em.slice(0, 7) // "2025-03"
        if (!porMes[mes]) porMes[mes] = { tokens: 0, custo_usd: 0, rows: [] }
        porMes[mes].tokens += r.tokens_total
        porMes[mes].custo_usd += r.custo_usd
        porMes[mes].rows.push(r)
      })

      // Busca conversas e mensagens por mês
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
      setCarregando(false)
    }
    fetchExtrato()
  }, [tenant.id])

  async function fetchDetalhe(mes: string) {
    setMesSelecionado(mes)
    const supabase = createClient()
    const inicio = `${mes}-01T00:00:00.000Z`
    const fim = new Date(new Date(inicio).setMonth(new Date(inicio).getMonth() + 1)).toISOString()
    const { data } = await supabase.from('token_usage').select('criado_em, tokens_total, custo_usd, modelo').eq('tenant_id', tenant.id).gte('criado_em', inicio).lt('criado_em', fim).order('criado_em', { ascending: false })
    setDetalhe(data ?? [])
  }

  function nomeMes(mes: string) {
    const [ano, m] = mes.split('-')
    const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    return `${nomes[parseInt(m) - 1]}/${ano}`
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <div className="flex items-center gap-2">
            {mesSelecionado && (
              <button onClick={() => setMesSelecionado(null)} className="text-[#6B6B6B] hover:text-white transition-colors">
                <ChevronLeft size={18} />
              </button>
            )}
            <div>
              <h2 className="text-white font-semibold">Extrato de tokens — {tenant.nome}</h2>
              {mesSelecionado && <p className="text-[#6B6B6B] text-xs">{nomeMes(mesSelecionado)}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-white"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {carregando ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-[#050505] rounded-lg animate-pulse" />)}</div>
          ) : extrato.length === 0 ? (
            <div className="text-center py-12">
              <BarChart2 size={32} className="text-[#3A3A3A] mx-auto mb-3" />
              <p className="text-[#6B6B6B] text-sm">Nenhum dado de token registrado ainda.</p>
              <p className="text-[#3A3A3A] text-xs mt-1">Os dados aparecem automaticamente conforme o agente for utilizado.</p>
            </div>
          ) : mesSelecionado ? (
            // Detalhe por dia
            <div className="space-y-2">
              {detalhe.length === 0 ? (
                <p className="text-[#6B6B6B] text-sm text-center py-8">Nenhum detalhe disponível.</p>
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
          ) : (
            // Lista de meses
            <div className="space-y-3">
              {extrato.map(e => {
                const custoReais = e.custo_usd * 5.8
                const valorCobrar = custoReais * MARGEM
                return (
                  <div key={e.mes} className="bg-[#050505] border border-[#1F1F1F] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-white font-semibold">{nomeMes(e.mes)}</span>
                      <button onClick={() => fetchDetalhe(e.mes)} className="flex items-center gap-1 text-[#10B981] text-xs hover:underline">
                        Ver detalhes <ChevronRight size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-[#6B6B6B] text-xs mb-0.5">Conversas</p><p className="text-white font-medium">{e.conversas}</p></div>
                      <div><p className="text-[#6B6B6B] text-xs mb-0.5">Mensagens</p><p className="text-white font-medium">{e.mensagens}</p></div>
                      <div><p className="text-[#6B6B6B] text-xs mb-0.5">Tokens consumidos</p><p className="text-white font-medium">{e.tokens.toLocaleString('pt-BR')}</p></div>
                      <div><p className="text-[#6B6B6B] text-xs mb-0.5">Custo API</p><p className="text-white font-medium">R$ {custoReais.toFixed(2)}</p></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#1F1F1F] flex items-center justify-between">
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
      </div>
    </div>
  )
}

// ─── Dropdown de ações ────────────────────────────────────────────────────────

function AcoesDropdown({ tenant, onEditar, onToggleStatus, onResetar, onExtrato }: {
  tenant: Tenant
  onEditar: () => void
  onToggleStatus: () => void
  onResetar: () => void
  onExtrato: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const itens = [
    { label: 'Editar', icon: Edit2, action: onEditar },
    { label: tenant.status === 'bloqueado' ? 'Desbloquear' : 'Bloquear', icon: tenant.status === 'bloqueado' ? Unlock : Lock, action: onToggleStatus, danger: tenant.status !== 'bloqueado' },
    { label: 'Resetar senha', icon: KeyRound, action: onResetar },
    { label: 'Extrato de tokens', icon: BarChart2, action: onExtrato },
  ]

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto(!aberto)} className="text-[#6B6B6B] hover:text-white transition-colors p-1 rounded">
        <MoreVertical size={15} />
      </button>
      {aberto && (
        <div className="absolute right-0 top-7 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl shadow-xl z-30 w-48 py-1 overflow-hidden">
          {itens.map(({ label, icon: Icon, action, danger }) => (
            <button
              key={label}
              onClick={() => { action(); setAberto(false) }}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414]'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminClientesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [modalEditar, setModalEditar] = useState<Tenant | null>(null)
  const [modalSenha, setModalSenha] = useState<Tenant | null>(null)
  const [modalExtrato, setModalExtrato] = useState<Tenant | null>(null)
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

  function handleSalvoEditar(tenant: Tenant) {
    setTenants(prev => prev.map(t => t.id === tenant.id ? tenant : t))
    setModalEditar(null)
    mostrarSucesso(`Cliente "${tenant.nome}" atualizado!`)
  }

  async function handleToggleStatus(tenant: Tenant) {
    const novoStatus = tenant.status === 'bloqueado' ? 'ativo' : 'bloqueado'
    const supabase = createClient()
    await supabase.from('tenants').update({ status: novoStatus }).eq('id', tenant.id)
    setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, status: novoStatus } : t))
    mostrarSucesso(`Cliente "${tenant.nome}" ${novoStatus === 'bloqueado' ? 'bloqueado' : 'desbloqueado'}.`)
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
                return (
                  <tr key={t.id} className="border-b border-[#1F1F1F] last:border-0 hover:bg-[#141414] transition-colors">
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
                          {bloqueado && <span className="flex items-center gap-1 text-red-400 text-xs font-medium"><AlertTriangle size={11} /> Expirado</span>}
                          {expirando && !bloqueado && <span className="flex items-center gap-1 text-[#F59E0B] text-xs font-medium"><AlertTriangle size={11} /> {dias}d</span>}
                        </div>
                      ) : <span className="text-[#3A3A3A] text-sm">—</span>}
                    </td>
                    <td className="px-5 py-4"><span className="text-[#6B6B6B] text-sm">{new Date(t.criado_em).toLocaleDateString('pt-BR')}</span></td>
                    <td className="px-5 py-4">
                      <AcoesDropdown
                        tenant={t}
                        onEditar={() => setModalEditar(t)}
                        onToggleStatus={() => handleToggleStatus(t)}
                        onResetar={() => setModalSenha(t)}
                        onExtrato={() => setModalExtrato(t)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalNovo && <ModalNovoCliente onClose={() => setModalNovo(false)} onSalvo={handleSalvoNovo} />}
      {modalEditar && <ModalEditar tenant={modalEditar} onClose={() => setModalEditar(null)} onSalvo={handleSalvoEditar} />}
      {modalSenha && <ModalResetarSenha tenant={modalSenha} onClose={() => setModalSenha(null)} />}
      {modalExtrato && <ModalExtrato tenant={modalExtrato} onClose={() => setModalExtrato(null)} />}
    </div>
  )
}
