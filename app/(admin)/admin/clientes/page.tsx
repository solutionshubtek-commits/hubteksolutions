'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, AlertTriangle, CheckCircle2, AlertCircle,
  MoreVertical, X, Save, Eye, EyeOff,
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
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Modal novo cliente ───────────────────────────────────────────────────────

function ModalNovoCliente({
  onClose,
  onSalvo,
}: {
  onClose: () => void
  onSalvo: (t: Tenant) => void
}) {
  const [form, setForm] = useState<NovoTenant>({
    nome: '',
    slug: '',
    email_admin: '',
    senha_admin: '',
    expira_em: '',
    self_managed: false,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  // Auto-preenche slug a partir do nome
  function handleNome(nome: string) {
    setForm(prev => ({
      ...prev,
      nome,
      slug: prev.slug === slugify(prev.nome) || prev.slug === '' ? slugify(nome) : prev.slug,
    }))
  }

  async function handleSalvar() {
    if (!form.nome || !form.slug || !form.email_admin || !form.senha_admin || !form.expira_em) {
      setErro('Preencha todos os campos obrigatórios.')
      return
    }
    setSalvando(true)
    setErro('')

    const supabase = createClient()

    // 1. Verificar se slug já existe
    const { data: slugExiste } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', form.slug)
      .single()

    if (slugExiste) {
      setErro('Esse slug já está em uso. Escolha outro.')
      setSalvando(false)
      return
    }

    // 2. Criar tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({
        nome: form.nome,
        slug: form.slug,
        status: 'ativo',
        expira_em: form.expira_em,
      })
      .select()
      .single()

    if (tenantErr || !tenant) {
      setErro('Erro ao criar tenant: ' + (tenantErr?.message ?? 'desconhecido'))
      setSalvando(false)
      return
    }

    // 3. Criar usuário admin no Supabase Auth via API route
    const res = await fetch('/api/admin/criar-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email_admin,
        senha: form.senha_admin,
        tenant_id: tenant.id,
        role: form.self_managed ? 'self_managed' : 'admin_tenant',
        nome: form.nome,
      }),
    })

    const resData = await res.json()

    if (!res.ok) {
      // Rollback tenant
      await supabase.from('tenants').delete().eq('id', tenant.id)
      setErro('Erro ao criar usuário: ' + (resData.error ?? 'desconhecido'))
      setSalvando(false)
      return
    }

    setSalvando(false)
    onSalvo(tenant)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F1F1F]">
          <h2 className="text-white font-semibold">Cadastrar novo cliente</h2>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Nome */}
          <div>
            <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Nome da empresa *</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => handleNome(e.target.value)}
              placeholder="Ex: Pizzaria Vesúvio"
              className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Slug (identificador único) *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="pizzaria-vesuvio"
              className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981] font-mono"
            />
          </div>

          {/* Email admin */}
          <div>
            <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">E-mail do admin *</label>
            <input
              type="email"
              value={form.email_admin}
              onChange={(e) => setForm({ ...form, email_admin: e.target.value })}
              placeholder="cliente@empresa.com"
              className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]"
            />
          </div>

          {/* Senha */}
          <div>
            <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Senha inicial *</label>
            <div className="relative">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={form.senha_admin}
                onChange={(e) => setForm({ ...form, senha_admin: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                className="w-full bg-[#050505] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#10B981]"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-white transition-colors"
              >
                {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Expiração */}
          <div>
            <label className="text-[#A3A3A3] text-sm font-medium block mb-1.5">Data de expiração do acesso *</label>
            <input
              type="date"
              value={form.expira_em}
              onChange={(e) => setForm({ ...form, expira_em: e.target.value })}
              className="w-full bg-[#050505] border border-[#1F1F1F] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981] [color-scheme:dark]"
            />
          </div>

          {/* Self-managed toggle */}
          <div className="flex items-center justify-between bg-[#050505] border border-[#1F1F1F] rounded-lg px-4 py-3">
            <div>
              <p className="text-white text-sm font-medium">Permitir autogestão do agente</p>
              <p className="text-[#6B6B6B] text-xs mt-0.5">Cliente poderá editar prompt, horários e base de conhecimento</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, self_managed: !prev.self_managed }))}
              style={{
                width: 44, minWidth: 44, height: 24,
                padding: 0, border: 'none', outline: 'none',
                borderRadius: 999, position: 'relative',
                cursor: 'pointer', flexShrink: 0,
                backgroundColor: form.self_managed ? '#10B981' : '#2A2A2A',
                transition: 'background-color 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2,
                left: form.self_managed ? 22 : 2,
                width: 20, height: 20,
                borderRadius: '50%', backgroundColor: '#fff',
                transition: 'left 0.2s ease',
                display: 'block',
              }} />
            </button>
          </div>

          {/* Erro */}
          {erro && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{erro}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1F1F1F]">
          <button
            onClick={onClose}
            className="text-[#A3A3A3] hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            <Save size={14} />
            {salvando ? 'Salvando...' : 'Cadastrar cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminClientesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    async function fetchTenants() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tenants')
        .select('id, nome, slug, status, expira_em, criado_em')
        .order('criado_em', { ascending: false })
      setTenants(data ?? [])
      setCarregando(false)
    }
    fetchTenants()
  }, [])

  function handleSalvo(tenant: Tenant) {
    setTenants(prev => [tenant, ...prev])
    setModalAberto(false)
    setSucesso(`Cliente "${tenant.nome}" cadastrado com sucesso!`)
    setTimeout(() => setSucesso(''), 4000)
  }

  const tenantsFiltrados = tenants.filter(t =>
    t.nome.toLowerCase().includes(busca.toLowerCase()) ||
    t.slug.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div>
      {/* Page head */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[#6B6B6B] text-sm mb-1">Gestão</p>
          <h1 className="text-white text-2xl font-bold">Clientes</h1>
          <p className="text-[#A3A3A3] text-sm mt-1">
            {tenants.length} contas cadastradas.
          </p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={15} />
          Cadastrar cliente
        </button>
      </div>

      {/* Sucesso */}
      {sucesso && (
        <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 flex items-center gap-2 mb-6">
          <CheckCircle2 size={14} className="text-[#10B981]" />
          <p className="text-[#10B981] text-sm">{sucesso}</p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
        <input
          type="text"
          placeholder="Buscar por nome ou slug..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full bg-[#0A0A0A] border border-[#1F1F1F] text-white placeholder-[#6B6B6B] rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#10B981]"
        />
      </div>

      {/* Tabela */}
      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl overflow-hidden">
        {carregando ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-[#050505] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : tenantsFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[#6B6B6B] text-sm">Nenhum cliente encontrado.</p>
          </div>
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
              {tenantsFiltrados.map((t, i) => {
                const cfg = statusConfig(t.status)
                const dias = diasRestantes(t.expira_em)
                const expirando = dias !== null && dias <= 10 && dias >= 0
                const bloqueado = dias !== null && dias < 0

                return (
                  <tr key={t.id} className={`border-b border-[#1F1F1F] last:border-0 hover:bg-[#141414] transition-colors ${i % 2 === 0 ? '' : ''}`}>
                    {/* Nome */}
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

                    {/* Status */}
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                        style={{ color: cfg.cor, background: cfg.bg, borderColor: cfg.border }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.cor }} />
                        {cfg.label}
                      </span>
                    </td>

                    {/* Expiração */}
                    <td className="px-5 py-4">
                      {t.expira_em ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[#A3A3A3] text-sm">
                            {new Date(t.expira_em).toLocaleDateString('pt-BR')}
                          </span>
                          {bloqueado && (
                            <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                              <AlertTriangle size={11} /> Expirado
                            </span>
                          )}
                          {expirando && !bloqueado && (
                            <span className="flex items-center gap-1 text-[#F59E0B] text-xs font-medium">
                              <AlertTriangle size={11} /> {dias}d
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#3A3A3A] text-sm">—</span>
                      )}
                    </td>

                    {/* Cadastro */}
                    <td className="px-5 py-4">
                      <span className="text-[#6B6B6B] text-sm">
                        {new Date(t.criado_em).toLocaleDateString('pt-BR')}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-4">
                      <button className="text-[#6B6B6B] hover:text-white transition-colors">
                        <MoreVertical size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalAberto && (
        <ModalNovoCliente
          onClose={() => setModalAberto(false)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  )
}
