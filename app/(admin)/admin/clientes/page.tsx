'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, AlertTriangle, CheckCircle2, AlertCircle,
  X, Save, Eye, EyeOff, Lock, Unlock, Key,
  ChevronRight, RefreshCw, Trash2, Smartphone, LogOut, ShieldAlert, MessageCircle,
} from 'lucide-react'

interface Tenant {
  id: string; nome: string; slug: string; status: string
  expira_em: string | null; criado_em: string; plano: string
}
interface TenantInstance {
  id: string; instance_name: string; apelido: string; status: string
}
interface ExtratoMes {
  mes: string; conversas: number; tokens: number; custo_brl: number
}
interface NovoTenant {
  nome: string; slug: string; email_admin: string
  senha_admin: string; expira_em: string; self_managed: boolean; plano: string
  instancias: { apelido: string }[]
}

const PLANOS = [
  { value: 'essencial',  label: 'Essencial',  limite: 50,   valor: 397  },
  { value: 'acelerador', label: 'Acelerador', limite: 100,  valor: 597  },
  { value: 'dominancia', label: 'Dominância', limite: 500,  valor: 997  },
  { value: 'elite',      label: 'Elite',      limite: 1000, valor: 1497 },
]

function planoConfig(plano: string) {
  return PLANOS.find(p => p.value === plano) ?? PLANOS[0]
}

function statusConfig(status: string) {
  const map: Record<string, { label: string; cor: string; bg: string; border: string }> = {
    ativo:     { label: 'Ativo',     cor: '#10B981', bg: '#10B98118', border: '#10B98140' },
    inativo:   { label: 'Inativo',   cor: '#71717A', bg: '#71717A18', border: '#71717A40' },
    bloqueado: { label: 'Bloqueado', cor: '#EF4444', bg: '#EF444418', border: '#EF444440' },
  }
  return map[status] ?? map['inativo']
}

function diasRestantes(expira_em: string | null) {
  if (!expira_em) return null
  return Math.ceil((new Date(expira_em).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function slugify(nome: string) {
  return nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function fmtBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

// ─── Modal Novo Cliente ───────────────────────────────────────────────────────

function ModalNovoCliente({ onClose, onSalvo }: { onClose: () => void; onSalvo: (t: Tenant) => void }) {
  const [form, setForm] = useState<NovoTenant>({
    nome: '', slug: '', email_admin: '', senha_admin: '',
    expira_em: '', self_managed: false, plano: 'essencial',
    instancias: [{ apelido: 'Principal' }],
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  function handleNome(nome: string) {
    setForm(prev => ({ ...prev, nome, slug: prev.slug === slugify(prev.nome) || prev.slug === '' ? slugify(nome) : prev.slug }))
  }

  function addInstancia() {
    if (form.instancias.length >= 5) return
    setForm(prev => ({
      ...prev,
      instancias: [...prev.instancias, { apelido: `Conexão ${prev.instancias.length + 1}` }],
    }))
  }

  function removeInstancia(idx: number) {
    if (form.instancias.length <= 1) return
    setForm(prev => ({ ...prev, instancias: prev.instancias.filter((_, i) => i !== idx) }))
  }

  function updateApelido(idx: number, apelido: string) {
    setForm(prev => ({
      ...prev,
      instancias: prev.instancias.map((inst, i) => i === idx ? { apelido } : inst),
    }))
  }

  async function handleSalvar() {
    if (!form.nome || !form.slug || !form.email_admin || !form.senha_admin || !form.expira_em) {
      setErro('Preencha todos os campos obrigatórios.'); return
    }
    setSalvando(true); setErro('')
    const supabase = createClient()
    const { data: slugExiste } = await supabase.from('tenants').select('id').eq('slug', form.slug).single()
    if (slugExiste) { setErro('Esse slug já está em uso.'); setSalvando(false); return }

    const { data: tenant, error: tenantErr } = await supabase.from('tenants')
      .insert({ nome: form.nome, slug: form.slug, status: 'ativo', expira_em: form.expira_em, plano: form.plano })
      .select().single()
    if (tenantErr || !tenant) { setErro('Erro ao criar tenant: ' + (tenantErr?.message ?? 'desconhecido')); setSalvando(false); return }

    const res = await fetch('/api/admin/criar-usuario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email_admin, senha: form.senha_admin, tenant_id: tenant.id,
        role: form.self_managed ? 'self_managed' : 'admin_tenant', nome: form.nome,
        slug: form.slug, instancias: form.instancias,
      }),
    })
    const resData = await res.json()
    if (!res.ok) {
      await supabase.from('tenants').delete().eq('id', tenant.id)
      setErro('Erro ao criar usuário: ' + (resData.error ?? 'desconhecido')); setSalvando(false); return
    }
    setSalvando(false); onSalvo(tenant)
  }

  const inputStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Cadastrar novo cliente</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nome da empresa *</label>
            <input type="text" value={form.nome} onChange={(e) => handleNome(e.target.value)}
              placeholder="Ex: Pizzaria Vesúvio" className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Slug (identificador único) *</label>
            <input type="text" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="pizzaria-vesuvio" className="w-full rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>E-mail do admin *</label>
            <input type="email" value={form.email_admin} onChange={(e) => setForm({ ...form, email_admin: e.target.value })}
              placeholder="cliente@empresa.com" className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Senha inicial *</label>
            <div className="relative">
              <input type={mostrarSenha ? 'text' : 'password'} value={form.senha_admin}
                onChange={(e) => setForm({ ...form, senha_admin: e.target.value })}
                placeholder="Mínimo 8 caracteres" className="w-full rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none" style={inputStyle} />
              <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Data de expiração *</label>
            <input type="date" value={form.expira_em} onChange={(e) => setForm({ ...form, expira_em: e.target.value })}
              className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none [color-scheme:dark]" style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Plano contratado *</label>
            <div className="grid grid-cols-2 gap-2">
              {PLANOS.map(p => (
                <button key={p.value} type="button"
                  onClick={() => setForm(prev => ({ ...prev, plano: p.value }))}
                  className="rounded-lg px-3 py-2.5 text-left transition-all"
                  style={{
                    background: form.plano === p.value ? '#10B98118' : 'var(--bg-surface-2)',
                    border: form.plano === p.value ? '1px solid #10B98160' : '1px solid var(--border)',
                  }}>
                  <p className="text-sm font-semibold" style={{ color: form.plano === p.value ? '#10B981' : 'var(--text-primary)' }}>{p.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>até {p.limite} conv. · {fmtBRL(p.valor)}/mês</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Instâncias WhatsApp ({form.instancias.length}/5)
              </label>
              {form.instancias.length < 5 && (
                <button type="button" onClick={addInstancia}
                  className="flex items-center gap-1 text-xs font-medium text-[#10B981] hover:text-[#059669] transition-colors">
                  <Plus size={13} /> Adicionar
                </button>
              )}
            </div>
            <div className="space-y-2">
              {form.instancias.map((inst, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <Smartphone size={14} color="#10B981" />
                  </div>
                  <input type="text" value={inst.apelido} onChange={(e) => updateApelido(idx, e.target.value)}
                    placeholder="Ex: Vendas, Suporte..." className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                  {form.instancias.length > 1 && (
                    <button type="button" onClick={() => removeInstancia(idx)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10" style={{ color: 'var(--text-muted)' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Cada instância = 1 número de WhatsApp conectado. Máximo 5 por cliente.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg px-4 py-3"
            style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Permitir autogestão do agente</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Cliente poderá editar prompt, horários e base de conhecimento</p>
            </div>
            <button type="button" onClick={() => setForm(prev => ({ ...prev, self_managed: !prev.self_managed }))}
              style={{ width: 44, minWidth: 44, height: 24, padding: 0, border: 'none', outline: 'none', borderRadius: 999,
                position: 'relative', cursor: 'pointer', flexShrink: 0,
                backgroundColor: form.self_managed ? '#10B981' : 'var(--border-2)', transition: 'background-color 0.2s' }}>
              <span style={{ position: 'absolute', top: 2, left: form.self_managed ? 22 : 2, width: 20, height: 20,
                borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s ease', display: 'block' }} />
            </button>
          </div>
          {erro && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{erro}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 sticky bottom-0"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <button onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={salvando}
            className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
            <Save size={14} />{salvando ? 'Salvando...' : 'Cadastrar cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SlideOver ────────────────────────────────────────────────────────────────

function SlideOver({ tenant, onClose, onAtualizado }: {
  tenant: Tenant; onClose: () => void; onAtualizado: (t: Tenant) => void
}) {
  const [aba, setAba] = useState<'detalhes' | 'editar' | 'senha' | 'extrato' | 'instancias'>('detalhes')
  const [nomeEdit, setNomeEdit] = useState(tenant.nome)
  const [expiraEdit, setExpiraEdit] = useState(tenant.expira_em?.slice(0, 10) ?? '')
  const [planoEdit, setPlanoEdit] = useState(tenant.plano ?? 'essencial')
  const [salvandoEdit, setSalvandoEdit] = useState(false)
  const [erroEdit, setErroEdit] = useState('')
  const [sucessoEdit, setSucessoEdit] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState('')
  const [sucessoSenha, setSucessoSenha] = useState('')
  const [salvandoStatus, setSalvandoStatus] = useState(false)
  const [extrato, setExtrato] = useState<ExtratoMes[]>([])
  const [carregandoExtrato, setCarregandoExtrato] = useState(false)
  const [instancias, setInstancias] = useState<TenantInstance[]>([])
  const [carregandoInst, setCarregandoInst] = useState(false)
  const [novasInstancias, setNovasInstancias] = useState<{ apelido: string }[]>([])
  const [adicionandoInst, setAdicionandoInst] = useState(false)
  const [erroInst, setErroInst] = useState('')
  const [sucessoInst, setSucessoInst] = useState('')
  const [desconectandoInst, setDesconectandoInst] = useState<Record<string, boolean>>({})
  const [confirmDesconectarInst, setConfirmDesconectarInst] = useState<string | null>(null)
  const [excluindoInst, setExcluindoInst] = useState<Record<string, boolean>>({})
  const [confirmExcluirInst, setConfirmExcluirInst] = useState<string | null>(null)

  useEffect(() => {
    if (aba === 'extrato') carregarExtrato()
    if (aba === 'instancias') carregarInstancias()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba])

  async function carregarInstancias() {
    setCarregandoInst(true)
    const res = await fetch(`/api/whatsapp/status?tenant_id=${tenant.id}`)
    const data = await res.json()
    setInstancias((data.instancias ?? []) as TenantInstance[])
    setCarregandoInst(false)
  }

  async function handleDesconectarInstAdmin(instanceName: string) {
    setDesconectandoInst(prev => ({ ...prev, [instanceName]: true }))
    setConfirmDesconectarInst(null)
    const res = await fetch('/api/whatsapp/desconectar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_name: instanceName }),
    })
    setDesconectandoInst(prev => ({ ...prev, [instanceName]: false }))
    if (res.ok) await carregarInstancias()
  }

  async function handleExcluirInstAdmin(instanceName: string) {
    setExcluindoInst(prev => ({ ...prev, [instanceName]: true }))
    setConfirmExcluirInst(null)
    await fetch('/api/admin/deletar-instancia', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_name: instanceName, tenant_id: tenant.id }),
    })
    setExcluindoInst(prev => ({ ...prev, [instanceName]: false }))
    await carregarInstancias()
  }

  async function handleAdicionarInstancias() {
    if (novasInstancias.length === 0) return
    const totalAtual = instancias.length + novasInstancias.length
    if (totalAtual > 5) { setErroInst('Máximo de 5 instâncias por cliente.'); return }
    setAdicionandoInst(true); setErroInst(''); setSucessoInst('')
    const res = await fetch('/api/admin/criar-instancia-evolution', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenant.id, instancias: novasInstancias }),
    })
    const data = await res.json()
    setAdicionandoInst(false)
    if (!res.ok || !data.success) {
      setErroInst('Erro ao criar instância: ' + (data.error ?? 'desconhecido')); return
    }
    setSucessoInst(`${data.criadas.length} instância(s) criada(s) com sucesso!`)
    setNovasInstancias([])
    await carregarInstancias()
    setTimeout(() => setSucessoInst(''), 3000)
  }

  async function carregarExtrato() {
    setCarregandoExtrato(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('ai_usage')
      .select('ciclo_mes, ciclo_ano, tokens_entrada, tokens_saida, custo_estimado_reais')
      .eq('tenant_id', tenant.id)
      .order('ciclo_ano', { ascending: false })
      .order('ciclo_mes', { ascending: false })

    if (data) {
      const porMes: Record<string, ExtratoMes> = {}
      data.forEach(row => {
        const key = `${row.ciclo_ano}-${String(row.ciclo_mes).padStart(2, '0')}`
        if (!porMes[key]) porMes[key] = { mes: key, conversas: 0, tokens: 0, custo_brl: 0 }
        porMes[key].tokens += (row.tokens_entrada ?? 0) + (row.tokens_saida ?? 0)
        porMes[key].custo_brl += Number(row.custo_estimado_reais ?? 0)
      })
      const { data: convData } = await supabase
        .from('conversations').select('criado_em').eq('tenant_id', tenant.id)
      ;(convData ?? []).forEach((c: { criado_em: string }) => {
        const d = new Date(c.criado_em)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (porMes[key]) porMes[key].conversas += 1
      })
      setExtrato(Object.values(porMes).sort((a, b) => b.mes.localeCompare(a.mes)))
    }
    setCarregandoExtrato(false)
  }

  async function handleSalvarEdicao() {
    setSalvandoEdit(true); setErroEdit(''); setSucessoEdit('')
    const supabase = createClient()
    const { error } = await supabase.from('tenants')
      .update({ nome: nomeEdit, expira_em: expiraEdit || null, plano: planoEdit })
      .eq('id', tenant.id)
    setSalvandoEdit(false)
    if (error) { setErroEdit('Erro ao salvar: ' + error.message); return }
    setSucessoEdit('Salvo com sucesso!')
    onAtualizado({ ...tenant, nome: nomeEdit, expira_em: expiraEdit || null, plano: planoEdit })
    setTimeout(() => setSucessoEdit(''), 2500)
  }

  async function handleResetarSenha() {
    if (!novaSenha || novaSenha.length < 8) { setErroSenha('Mínimo 8 caracteres.'); return }
    setSalvandoSenha(true); setErroSenha(''); setSucessoSenha('')
    const res = await fetch('/api/admin/resetar-senha', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenant.id, nova_senha: novaSenha }),
    })
    const data = await res.json()
    setSalvandoSenha(false)
    if (!res.ok) { setErroSenha(data.error ?? 'Erro desconhecido'); return }
    setSucessoSenha('Senha redefinida com sucesso!'); setNovaSenha('')
    setTimeout(() => setSucessoSenha(''), 2500)
  }

  async function handleToggleStatus() {
    setSalvandoStatus(true)
    const novoStatus = tenant.status === 'bloqueado' ? 'ativo' : 'bloqueado'
    const supabase = createClient()
    await supabase.from('tenants').update({ status: novoStatus }).eq('id', tenant.id)
    setSalvandoStatus(false)
    onAtualizado({ ...tenant, status: novoStatus })
  }

  const dias = diasRestantes(tenant.expira_em)
  const expirando = dias !== null && dias <= 10 && dias >= 0
  const expirado = dias !== null && dias < 0
  const cfg = statusConfig(tenant.status)
  const plano = planoConfig(tenant.plano)
  const inputStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  const statusInstancia = (s: string) => {
    if (s === 'banido') return { label: 'Banido', cor: '#EF4444', bg: '#EF444415', border: '#EF444430' }
    if (s === 'open' || s === 'conectado') return { label: 'Conectado', cor: '#10B981', bg: '#10B98115', border: '#10B98130' }
    return { label: 'Desconectado', cor: '#71717A', bg: '#71717A15', border: '#71717A30' }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md z-50 flex flex-col shadow-2xl"
        style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
              {tenant.nome.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{tenant.nome}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{tenant.slug}</p>
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#10B98118', color: '#10B981' }}>
                  {plano.label}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Abas */}
        <div className="flex overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
          {(['detalhes', 'instancias', 'editar', 'senha', 'extrato'] as const).map(a => (
            <button key={a} onClick={() => setAba(a)}
              className="flex-shrink-0 py-3 px-3 text-xs font-semibold transition-colors"
              style={{
                color: aba === a ? '#10B981' : 'var(--text-muted)',
                borderBottom: aba === a ? '2px solid #10B981' : '2px solid transparent',
              }}>
              {a === 'detalhes' ? 'Detalhes' : a === 'instancias' ? 'WhatsApp' : a === 'editar' ? 'Editar' : a === 'senha' ? 'Senha' : 'Extrato'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* Aba Detalhes */}
          {aba === 'detalhes' && (
            <div className="space-y-4">
              <div className="space-y-3">
                {([
                  ['Nome', tenant.nome],
                  ['Slug', tenant.slug],
                  ['Cadastrado em', new Date(tenant.criado_em).toLocaleDateString('pt-BR')],
                  ['Expira em', tenant.expira_em ? new Date(tenant.expira_em).toLocaleDateString('pt-BR') : '—'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span className={`text-sm font-medium ${label === 'Slug' ? 'font-mono' : ''}`}
                      style={{ color: label === 'Slug' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Plano</span>
                  <div className="text-right">
                    <span className="text-sm font-semibold" style={{ color: '#10B981' }}>{plano.label}</span>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>até {plano.limite} conv. · {fmtBRL(plano.valor)}/mês</p>
                  </div>
                </div>
                <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Status</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                    style={{ color: cfg.cor, background: cfg.bg, borderColor: cfg.border }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.cor }} />{cfg.label}
                  </span>
                </div>
              </div>
              {(expirando || expirado) && (
                <div className={`flex items-center gap-2 p-3 rounded-lg border ${expirado ? 'bg-red-500/10 border-red-500/30' : 'bg-[#F59E0B]/10 border-[#F59E0B]/30'}`}>
                  <AlertTriangle size={14} className={expirado ? 'text-red-400' : 'text-[#F59E0B]'} />
                  <p className={`text-xs font-medium ${expirado ? 'text-red-400' : 'text-[#F59E0B]'}`}>
                    {expirado ? `Acesso expirado há ${Math.abs(dias!)} dias` : `Acesso expira em ${dias} dias`}
                  </p>
                </div>
              )}
              <button onClick={handleToggleStatus} disabled={salvandoStatus}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${tenant.status === 'bloqueado' ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                {salvandoStatus ? <RefreshCw size={14} className="animate-spin" /> : tenant.status === 'bloqueado' ? <Unlock size={14} /> : <Lock size={14} />}
                {tenant.status === 'bloqueado' ? 'Desbloquear acesso' : 'Bloquear acesso'}
              </button>
            </div>
          )}

          {/* Aba WhatsApp / Instâncias */}
          {aba === 'instancias' && (
            <div className="space-y-4">
              {carregandoInst ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />)}
                </div>
              ) : instancias.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Nenhuma instância configurada.</p>
              ) : (
                <div className="space-y-2">
                  {instancias.map(inst => {
                    const sc = statusInstancia(inst.status)
                    const conectado = inst.status === 'open' || inst.status === 'conectado'
                    const banido = inst.status === 'banido'
                    const estaDesconectando = desconectandoInst[inst.instance_name] ?? false
                    const pedindoConfirm = confirmDesconectarInst === inst.instance_name
                    const estaExcluindo = excluindoInst[inst.instance_name] ?? false
                    const pedindoConfirmExcluir = confirmExcluirInst === inst.instance_name

                    return (
                      <div key={inst.id} className="rounded-xl p-3 space-y-2"
                        style={{
                          background: banido ? '#EF444408' : 'var(--bg-surface-2)',
                          border: banido ? '1px solid #EF444430' : '1px solid var(--border)',
                        }}>

                        {/* Info da instância */}
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: banido ? '#EF444415' : 'rgba(16,185,129,0.1)' }}>
                            {banido ? <ShieldAlert size={16} color="#EF4444" /> : <Smartphone size={16} color="#10B981" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{inst.apelido}</p>
                            <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{inst.instance_name}</p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ color: sc.cor, background: sc.bg, border: `1px solid ${sc.border}` }}>
                            {sc.label}
                          </span>
                        </div>

                        {/* Banner de banimento */}
                        {banido && (
                          <div className="rounded-lg p-3 space-y-2" style={{ background: '#EF444410', border: '1px solid #EF444430' }}>
                            <div className="flex items-start gap-2">
                              <ShieldAlert size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-red-400 font-medium leading-relaxed">
                                Este número foi banido ou bloqueado pelo WhatsApp. Desconecte e conecte um novo número para retomar o atendimento.
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setConfirmDesconectarInst(inst.instance_name)}
                                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg transition-colors"
                                style={{ background: 'var(--bg-surface)', border: '1px solid #EF444440', color: '#EF4444' }}
                              >
                                <LogOut size={12} /> Desconectar número
                              </button>
                              
                                href="https://wa.me/5551980104924"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg transition-colors"
                                style={{ background: '#10B98115', border: '1px solid #10B98130', color: '#10B981' }}
                              >
                                <MessageCircle size={12} /> Falar com suporte
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Botão desconectar — conectadas */}
                        {conectado && !pedindoConfirm && (
                          <button
                            onClick={() => setConfirmDesconectarInst(inst.instance_name)}
                            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg transition-colors"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                          >
                            <LogOut size={12} /> Desconectar número
                          </button>
                        )}

                        {/* Confirmação de desconexão */}
                        {(conectado || banido) && pedindoConfirm && (
                          <div className="rounded-lg p-3 space-y-2"
                            style={{ background: '#EF444410', border: '1px solid #EF444430' }}>
                            <p className="text-xs font-medium text-red-400">Confirmar desconexão de {inst.apelido}?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setConfirmDesconectarInst(null)}
                                className="flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors"
                                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleDesconectarInstAdmin(inst.instance_name)}
                                disabled={estaDesconectando}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors"
                              >
                                <LogOut size={11} className={estaDesconectando ? 'animate-spin' : ''} />
                                {estaDesconectando ? 'Desconectando...' : 'Confirmar'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Botão excluir — só para desconectadas */}
                        {!conectado && !banido && (
                          pedindoConfirmExcluir ? (
                            <div className="rounded-lg p-3 space-y-2"
                              style={{ background: '#EF444410', border: '1px solid #EF444430' }}>
                              <p className="text-xs font-medium text-red-400">Excluir &quot;{inst.apelido}&quot; permanentemente?</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setConfirmExcluirInst(null)}
                                  className="flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors"
                                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => handleExcluirInstAdmin(inst.instance_name)}
                                  disabled={estaExcluindo}
                                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors"
                                >
                                  <Trash2 size={11} className={estaExcluindo ? 'animate-spin' : ''} />
                                  {estaExcluindo ? 'Excluindo...' : 'Confirmar'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmExcluirInst(inst.instance_name)}
                              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg transition-colors"
                              style={{ background: 'var(--bg-surface)', border: '1px solid #EF444430', color: '#EF4444' }}
                            >
                              <Trash2 size={12} /> Excluir instância
                            </button>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Adicionar novas instâncias */}
              {instancias.length < 5 && (
                <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Adicionar instâncias ({instancias.length + novasInstancias.length}/5)
                    </p>
                    {novasInstancias.length < (5 - instancias.length) && (
                      <button type="button"
                        onClick={() => setNovasInstancias(prev => [...prev, { apelido: `Conexão ${instancias.length + prev.length + 1}` }])}
                        className="flex items-center gap-1 text-xs font-medium text-[#10B981]">
                        <Plus size={13} /> Adicionar
                      </button>
                    )}
                  </div>
                  {novasInstancias.map((inst, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input type="text" value={inst.apelido}
                        onChange={(e) => setNovasInstancias(prev => prev.map((n, i) => i === idx ? { apelido: e.target.value } : n))}
                        placeholder="Nome da conexão (ex: Vendas)"
                        className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                      <button type="button"
                        onClick={() => setNovasInstancias(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: 'var(--text-muted)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {novasInstancias.length > 0 && (
                    <button onClick={handleAdicionarInstancias} disabled={adicionandoInst}
                      className="w-full flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                      <Plus size={14} />{adicionandoInst ? 'Criando...' : 'Criar instâncias'}
                    </button>
                  )}
                </div>
              )}

              {erroInst && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400" /><p className="text-red-400 text-sm">{erroInst}</p></div>}
              {sucessoInst && <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2"><CheckCircle2 size={13} className="text-[#10B981]" /><p className="text-[#10B981] text-sm">{sucessoInst}</p></div>}
            </div>
          )}

          {/* Aba Editar */}
          {aba === 'editar' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nome da empresa</label>
                <input type="text" value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Data de expiração</label>
                <input type="date" value={expiraEdit} onChange={(e) => setExpiraEdit(e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none [color-scheme:dark]" style={inputStyle} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Plano contratado</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLANOS.map(p => (
                    <button key={p.value} type="button" onClick={() => setPlanoEdit(p.value)}
                      className="rounded-lg px-3 py-2.5 text-left transition-all"
                      style={{ background: planoEdit === p.value ? '#10B98118' : 'var(--bg-surface-2)', border: planoEdit === p.value ? '1px solid #10B98160' : '1px solid var(--border)' }}>
                      <p className="text-sm font-semibold" style={{ color: planoEdit === p.value ? '#10B981' : 'var(--text-primary)' }}>{p.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>até {p.limite} conv. · {fmtBRL(p.valor)}/mês</p>
                    </button>
                  ))}
                </div>
              </div>
              {erroEdit && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400" /><p className="text-red-400 text-sm">{erroEdit}</p></div>}
              {sucessoEdit && <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2"><CheckCircle2 size={13} className="text-[#10B981]" /><p className="text-[#10B981] text-sm">{sucessoEdit}</p></div>}
              <button onClick={handleSalvarEdicao} disabled={salvandoEdit}
                className="w-full flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                <Save size={14} />{salvandoEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}

          {/* Aba Senha */}
          {aba === 'senha' && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Redefine a senha do usuário <span className="font-medium" style={{ color: 'var(--text-primary)' }}>admin_tenant</span> deste cliente.
              </p>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nova senha</label>
                <div className="relative">
                  <input type={mostrarSenha ? 'text' : 'password'} value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo 8 caracteres"
                    className="w-full rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none" style={inputStyle} />
                  <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)}
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                    {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {erroSenha && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400" /><p className="text-red-400 text-sm">{erroSenha}</p></div>}
              {sucessoSenha && <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2"><CheckCircle2 size={13} className="text-[#10B981]" /><p className="text-[#10B981] text-sm">{sucessoSenha}</p></div>}
              <button onClick={handleResetarSenha} disabled={salvandoSenha}
                className="w-full flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                <Key size={14} />{salvandoSenha ? 'Redefinindo...' : 'Redefinir senha'}
              </button>
            </div>
          )}

          {/* Aba Extrato */}
          {aba === 'extrato' && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Consumo de tokens e custo estimado por mês.</p>
              {carregandoExtrato ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />)}</div>
              ) : extrato.length === 0 ? (
                <div className="p-8 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum registro de uso ainda.</p></div>
              ) : extrato.map(mes => {
                const [ano, m] = mes.mes.split('-')
                const nomeMes = new Date(+ano, +m - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                const valorPlano = planoConfig(tenant.plano).valor
                const margem = valorPlano - mes.custo_brl
                return (
                  <div key={mes.mes} className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{nomeMes}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['Conversas', mes.conversas.toLocaleString('pt-BR'), false],
                        ['Tokens', fmtCompact(mes.tokens), false],
                        ['Custo API', fmtBRL(mes.custo_brl), false],
                        ['Margem estimada', fmtBRL(margem), true],
                      ] as [string, string, boolean][]).map(([label, value, destaque]) => (
                        <div key={label} className={destaque ? 'col-span-2 rounded-lg p-2.5' : 'rounded-lg p-2.5'}
                          style={destaque ? { background: margem >= 0 ? '#10B98110' : '#EF444410', border: `1px solid ${margem >= 0 ? '#10B98120' : '#EF444420'}` } : { background: 'var(--bg-surface)' }}>
                          <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                          <p className="text-sm font-semibold" style={{ color: destaque ? (margem >= 0 ? '#10B981' : '#EF4444') : 'var(--text-primary)' }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AdminClientesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<Tenant | null>(null)
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const idParam = params.get('id')
    if (idParam && tenants.length > 0) {
      const found = tenants.find(t => t.id === idParam)
      if (found) setClienteSelecionado(found)
    }
  }, [tenants])

  const fetchTenants = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('tenants')
      .select('id, nome, slug, status, expira_em, criado_em, plano')
      .order('criado_em', { ascending: false })
    setTenants((data ?? []) as Tenant[])
    setCarregando(false)
  }, [])

  useEffect(() => { fetchTenants() }, [fetchTenants])

  function handleSalvo(tenant: Tenant) {
    setTenants(prev => [tenant, ...prev])
    setModalAberto(false)
    setSucesso('Cliente cadastrado com sucesso!')
    setTimeout(() => setSucesso(''), 4000)
  }

  function handleAtualizado(tenant: Tenant) {
    setTenants(prev => prev.map(t => t.id === tenant.id ? tenant : t))
    setClienteSelecionado(tenant)
  }

  const tenantsFiltrados = tenants.filter(t =>
    t.nome.toLowerCase().includes(busca.toLowerCase()) ||
    t.slug.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Gestão</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Clientes</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{tenants.length} contas cadastradas.</p>
        </div>
        <button onClick={() => setModalAberto(true)}
          className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
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
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input type="text" placeholder="Buscar por nome ou slug..." value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        {carregando ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />)}</div>
        ) : tenantsFiltrados.length === 0 ? (
          <div className="p-12 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum cliente encontrado.</p></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Cliente', 'Plano', 'Status', 'Expiração', 'Cadastro', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium px-5 py-3 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenantsFiltrados.map(t => {
                const cfg = statusConfig(t.status)
                const dias = diasRestantes(t.expira_em)
                const expirando = dias !== null && dias <= 10 && dias >= 0
                const expirado = dias !== null && dias < 0
                const selecionado = clienteSelecionado?.id === t.id
                const plano = planoConfig(t.plano)
                return (
                  <tr key={t.id} onClick={() => setClienteSelecionado(t)}
                    className="last:border-0 cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid var(--border)', background: selecionado ? 'rgba(16,185,129,0.05)' : 'transparent' }}
                    onMouseEnter={e => { if (!selecionado) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (!selecionado) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0"
                          style={{ background: selecionado ? 'rgba(16,185,129,0.2)' : 'var(--bg-hover)', color: selecionado ? '#10B981' : 'var(--text-secondary)' }}>
                          {t.nome.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.nome}</p>
                          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{t.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#10B98118', color: '#10B981' }}>{plano.label}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                        style={{ color: cfg.cor, background: cfg.bg, borderColor: cfg.border }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.cor }} />{cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {t.expira_em ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{new Date(t.expira_em).toLocaleDateString('pt-BR')}</span>
                          {expirado && <span className="flex items-center gap-1 text-red-400 text-xs"><AlertTriangle size={11} /> Expirado</span>}
                          {expirando && <span className="flex items-center gap-1 text-[#F59E0B] text-xs"><AlertTriangle size={11} /> {dias}d</span>}
                        </div>
                      ) : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{new Date(t.criado_em).toLocaleDateString('pt-BR')}</span>
                    </td>
                    <td className="px-5 py-4">
                      <ChevronRight size={15} style={{ color: selecionado ? '#10B981' : 'var(--text-muted)' }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalAberto && <ModalNovoCliente onClose={() => setModalAberto(false)} onSalvo={handleSalvo} />}
      {clienteSelecionado && (
        <SlideOver tenant={clienteSelecionado} onClose={() => setClienteSelecionado(null)} onAtualizado={handleAtualizado} />
      )}
    </div>
  )
}