'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, AlertTriangle, CheckCircle2, AlertCircle,
  X, Save, Eye, EyeOff, Lock, Unlock, Key,
  ChevronRight, RefreshCw,
} from 'lucide-react'

interface Tenant {
  id: string; nome: string; slug: string; status: string
  expira_em: string | null; criado_em: string
}
interface TokenMes { mes: string; conversas: number; tokens: number; custo_usd: number }
interface NovoTenant {
  nome: string; slug: string; email_admin: string
  senha_admin: string; expira_em: string; self_managed: boolean
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
    const { data: tenant, error: tenantErr } = await supabase.from('tenants')
      .insert({ nome: form.nome, slug: form.slug, status: 'ativo', expira_em: form.expira_em })
      .select().single()
    if (tenantErr || !tenant) { setErro('Erro ao criar tenant: ' + (tenantErr?.message ?? 'desconhecido')); setSalvando(false); return }
    const res = await fetch('/api/admin/criar-usuario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email_admin, senha: form.senha_admin, tenant_id: tenant.id, role: form.self_managed ? 'self_managed' : 'admin_tenant', nome: form.nome }),
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
      <div className="rounded-xl w-full max-w-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Cadastrar novo cliente</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="hover:text-white"><X size={18} /></button>
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
          <div className="flex items-center justify-between rounded-lg px-4 py-3"
            style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Permitir autogestão do agente</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Cliente poderá editar prompt, horários e base de conhecimento</p>
            </div>
            <button type="button" onClick={() => setForm(prev => ({ ...prev, self_managed: !prev.self_managed }))}
              style={{ width: 44, minWidth: 44, height: 24, padding: 0, border: 'none', outline: 'none', borderRadius: 999, position: 'relative', cursor: 'pointer', flexShrink: 0, backgroundColor: form.self_managed ? '#10B981' : 'var(--border-2)', transition: 'background-color 0.2s' }}>
              <span style={{ position: 'absolute', top: 2, left: form.self_managed ? 22 : 2, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s ease', display: 'block' }} />
            </button>
          </div>
          {erro && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{erro}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando}
            className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
            <Save size={14} />{salvando ? 'Salvando...' : 'Cadastrar cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SlideOver({ tenant, onClose, onAtualizado }: { tenant: Tenant; onClose: () => void; onAtualizado: (t: Tenant) => void }) {
  const [aba, setAba] = useState<'detalhes' | 'editar' | 'senha' | 'extrato'>('detalhes')
  const [nomeEdit, setNomeEdit] = useState(tenant.nome)
  const [expiraEdit, setExpiraEdit] = useState(tenant.expira_em?.slice(0, 10) ?? '')
  const [salvandoEdit, setSalvandoEdit] = useState(false)
  const [erroEdit, setErroEdit] = useState('')
  const [sucessoEdit, setSucessoEdit] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState('')
  const [sucessoSenha, setSucessoSenha] = useState('')
  const [salvandoStatus, setSalvandoStatus] = useState(false)
  const [extrato, setExtrato] = useState<TokenMes[]>([])
  const [carregandoExtrato, setCarregandoExtrato] = useState(false)

  useEffect(() => {
    if (aba === 'extrato') carregarExtrato()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba])

  async function carregarExtrato() {
    setCarregandoExtrato(true)
    const supabase = createClient()
    const { data } = await supabase.from('token_usage')
      .select('criado_em, tokens_total, custo_usd, conversation_id')
      .eq('tenant_id', tenant.id).order('criado_em', { ascending: false })
    if (data) {
      const porMes: Record<string, TokenMes> = {}
      const convIds = new Set<string>()
      data.forEach(row => {
        const mes = row.criado_em.slice(0, 7)
        if (!porMes[mes]) porMes[mes] = { mes, conversas: 0, tokens: 0, custo_usd: 0 }
        porMes[mes].tokens += row.tokens_total ?? 0
        porMes[mes].custo_usd += row.custo_usd ?? 0
        if (row.conversation_id && !convIds.has(row.conversation_id + mes)) {
          convIds.add(row.conversation_id + mes); porMes[mes].conversas += 1
        }
      })
      setExtrato(Object.values(porMes).sort((a, b) => b.mes.localeCompare(a.mes)))
    }
    setCarregandoExtrato(false)
  }

  async function handleSalvarEdicao() {
    setSalvandoEdit(true); setErroEdit(''); setSucessoEdit('')
    const supabase = createClient()
    const { error } = await supabase.from('tenants').update({ nome: nomeEdit, expira_em: expiraEdit || null }).eq('id', tenant.id)
    setSalvandoEdit(false)
    if (error) { setErroEdit('Erro ao salvar: ' + error.message); return }
    setSucessoEdit('Salvo com sucesso!')
    onAtualizado({ ...tenant, nome: nomeEdit, expira_em: expiraEdit || null })
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
  const inputStyle = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md z-50 flex flex-col shadow-2xl"
        style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
              {tenant.nome.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{tenant.nome}</p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{tenant.slug}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
          {(['detalhes', 'editar', 'senha', 'extrato'] as const).map(a => (
            <button key={a} onClick={() => setAba(a)}
              className="flex-1 py-3 text-xs font-semibold transition-colors"
              style={{ color: aba === a ? '#10B981' : 'var(--text-muted)', borderBottom: aba === a ? '2px solid #10B981' : '2px solid transparent' }}>
              {a === 'detalhes' ? 'Detalhes' : a === 'editar' ? 'Editar' : a === 'senha' ? 'Senha' : 'Extrato'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
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
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${tenant.status === 'bloqueado' ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/20' : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'}`}>
                {salvandoStatus ? <RefreshCw size={14} className="animate-spin" /> : tenant.status === 'bloqueado' ? <Unlock size={14} /> : <Lock size={14} />}
                {tenant.status === 'bloqueado' ? 'Desbloquear acesso' : 'Bloquear acesso'}
              </button>
            </div>
          )}

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
              {erroEdit && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"><AlertCircle size={13} className="text-red-400" /><p className="text-red-400 text-sm">{erroEdit}</p></div>}
              {sucessoEdit && <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2"><CheckCircle2 size={13} className="text-[#10B981]" /><p className="text-[#10B981] text-sm">{sucessoEdit}</p></div>}
              <button onClick={handleSalvarEdicao} disabled={salvandoEdit}
                className="w-full flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                <Save size={14} />{salvandoEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}

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

          {aba === 'extrato' && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Consumo de tokens e custo estimado por mês.</p>
              {carregandoExtrato ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />)}</div>
              ) : extrato.length === 0 ? (
                <div className="p-8 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum registro de uso ainda.</p></div>
              ) : extrato.map(mes => {
                const custoBRL = mes.custo_usd * 5.8
                const cobrar = custoBRL * 3
                const [ano, m] = mes.mes.split('-')
                const nomeMes = new Date(+ano, +m - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                return (
                  <div key={mes.mes} className="rounded-xl p-4 space-y-2"
                    style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{nomeMes}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['Conversas', mes.conversas.toLocaleString('pt-BR')],
                        ['Tokens', fmtCompact(mes.tokens)],
                        ['Custo API', `R$ ${custoBRL.toFixed(2).replace('.', ',')}`],
                        ['Valor a cobrar (3x)', `R$ ${cobrar.toFixed(2).replace('.', ',')}`],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label}
                          className={label === 'Valor a cobrar (3x)' ? 'bg-[#10B981]/10 border border-[#10B981]/20 col-span-2 rounded-lg p-2.5' : 'rounded-lg p-2.5'}
                          style={label !== 'Valor a cobrar (3x)' ? { background: 'var(--bg-surface)' } : {}}>
                          <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                          <p className={`text-sm font-semibold ${label === 'Valor a cobrar (3x)' ? 'text-[#10B981]' : ''}`}
                            style={{ color: label !== 'Valor a cobrar (3x)' ? 'var(--text-primary)' : '#10B981' }}>{value}</p>
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
      .select('id, nome, slug, status, expira_em, criado_em')
      .order('criado_em', { ascending: false })
    setTenants(data ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { fetchTenants() }, [fetchTenants])

  function handleSalvo(tenant: Tenant) {
    setTenants(prev => [tenant, ...prev])
    setModalAberto(false)
    setSucesso(`Cliente "${tenant.nome}" cadastrado com sucesso!`)
    setTimeout(() => setSucesso(''), 4000)
  }

  function handleAtualizado(tenant: Tenant) {
    setTenants(prev => prev.map(t => t.id === tenant.id ? tenant : t))
    setClienteSelecionado(tenant)
  }

  const tenantsFiltrados = tenants.filter(t =>
    t.nome.toLowerCase().includes(busca.toLowerCase()) || t.slug.toLowerCase().includes(busca.toLowerCase())
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
        <input type="text" placeholder="Buscar por nome ou slug..." value={busca} onChange={(e) => setBusca(e.target.value)}
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
                {['Cliente', 'Status', 'Expiração', 'Cadastro', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium px-5 py-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
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
                      ) : <span className="text-sm" style={{ color: 'var(--text-label)' }}>—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{new Date(t.criado_em).toLocaleDateString('pt-BR')}</span>
                    </td>
                    <td className="px-5 py-4">
                      <ChevronRight size={15} style={{ color: selecionado ? '#10B981' : 'var(--text-label)' }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalAberto && <ModalNovoCliente onClose={() => setModalAberto(false)} onSalvo={handleSalvo} />}
      {clienteSelecionado && <SlideOver tenant={clienteSelecionado} onClose={() => setClienteSelecionado(null)} onAtualizado={handleAtualizado} />}
    </div>
  )
}
