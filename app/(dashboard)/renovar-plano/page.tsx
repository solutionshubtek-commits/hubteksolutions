'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, ExternalLink } from 'lucide-react'

interface TenantInfo {
  nome: string
  plano: string
  expira_em: string | null
}

const PLANOS = [
  { value: 'essencial',  label: 'Essencial',  limite: 50,   valor: 397  },
  { value: 'acelerador', label: 'Acelerador', limite: 100,  valor: 597  },
  { value: 'dominancia', label: 'Dominância', limite: 500,  valor: 1997 },
  { value: 'elite',      label: 'Elite',      limite: 1000, valor: 3500 },
]

const PERIODOS = [
  { value: 'trimestral', label: 'Trimestral', meses: 3,  desconto: 0    },
  { value: 'semestral',  label: 'Semestral',  meses: 6,  desconto: 0.05 },
  { value: 'anual',      label: 'Anual',      meses: 12, desconto: 0.10 },
]

function fmtBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function diasRestantes(expira_em: string | null) {
  if (!expira_em) return null
  return Math.ceil((new Date(expira_em).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function RenovarPlanoPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [planoSelecionado, setPlanoSelecionado] = useState<string>('')
  const [periodoSelecionado, setPeriodoSelecionado] = useState<string>('trimestral')

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) return
      const { data: tenantData } = await supabase.from('tenants').select('nome, plano, expira_em').eq('id', userData.tenant_id).single()
      if (tenantData) { setTenant(tenantData); setPlanoSelecionado(tenantData.plano ?? 'essencial') }
      setCarregando(false)
    }
    fetchData()
  }, [])

  const planoAtual    = PLANOS.find(p => p.value === tenant?.plano) ?? PLANOS[0]
  const planoEscolhido  = PLANOS.find(p => p.value === planoSelecionado) ?? PLANOS[0]
  const periodoEscolhido = PERIODOS.find(p => p.value === periodoSelecionado) ?? PERIODOS[0]
  const valorTotal    = planoEscolhido.valor * periodoEscolhido.meses * (1 - periodoEscolhido.desconto)
  const dias          = diasRestantes(tenant?.expira_em ?? null)
  const expirado      = dias !== null && dias < 0
  const expirando     = dias !== null && dias <= 10 && dias >= 0

  function gerarLinkWhatsApp() {
    const msg = `Olá! Sou *${tenant?.nome}* e gostaria de renovar meu plano *${planoEscolhido.label}* com período *${periodoEscolhido.label}*. Podem me enviar o link de pagamento?`
    return `https://wa.me/5551980104924?text=${encodeURIComponent(msg)}`
  }

  if (carregando) {
    return (
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-center px-4 py-6 md:py-8">
      <div className="w-full max-w-2xl space-y-5 md:space-y-6">

        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Renovar Plano</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Selecione o plano e período. Enviaremos o link via WhatsApp.
          </p>
        </div>

        {/* Status atual */}
        <div className="rounded-xl p-4 md:p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Plano atual</p>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{planoAtual.label}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>até {planoAtual.limite} conversas · {fmtBRL(planoAtual.valor)}/mês</p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expira em</p>
              <p className="text-sm font-semibold" style={{ color: expirado ? '#EF4444' : expirando ? '#F59E0B' : 'var(--text-primary)' }}>
                {tenant?.expira_em ? new Date(tenant.expira_em).toLocaleDateString('pt-BR') : '—'}
                {expirado && ' · Expirado'}
                {expirando && ` · ${dias}d restantes`}
              </p>
            </div>
          </div>
        </div>

        {/* Seleção de plano — 2 cols sempre */}
        <div className="rounded-xl p-4 md:p-5 space-y-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Escolha o plano</p>
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            {PLANOS.map(p => {
              const ativo   = planoSelecionado === p.value
              const isAtual = tenant?.plano === p.value
              return (
                <button key={p.value} type="button" onClick={() => setPlanoSelecionado(p.value)}
                  className="rounded-xl p-3 md:p-4 text-left transition-all"
                  style={{
                    background: ativo ? '#10B98110' : 'var(--bg-surface-2)',
                    border: ativo ? '2px solid #10B981' : '2px solid transparent',
                    outline: '1px solid var(--border)',
                  }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold" style={{ color: ativo ? '#10B981' : 'var(--text-primary)' }}>{p.label}</p>
                    {isAtual && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#10B98120', color: '#10B981' }}>atual</span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>até {p.limite} conv.</p>
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                    {fmtBRL(p.valor)}<span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>/mês</span>
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Seleção de período — 3 cols em sm+, coluna em mobile */}
        <div className="rounded-xl p-4 md:p-5 space-y-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Escolha o período</p>
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {PERIODOS.map(p => {
              const ativo = periodoSelecionado === p.value
              const valorComDesconto = planoEscolhido.valor * p.meses * (1 - p.desconto)
              return (
                <button key={p.value} type="button" onClick={() => setPeriodoSelecionado(p.value)}
                  className="rounded-xl p-3 md:p-4 text-left transition-all"
                  style={{
                    background: ativo ? '#10B98110' : 'var(--bg-surface-2)',
                    border: ativo ? '2px solid #10B981' : '2px solid transparent',
                    outline: '1px solid var(--border)',
                  }}>
                  <p className="text-sm font-semibold" style={{ color: ativo ? '#10B981' : 'var(--text-primary)' }}>{p.label}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{p.meses} meses</p>
                  {p.desconto > 0 && (
                    <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1" style={{ background: '#10B98120', color: '#10B981' }}>
                      -{Math.round(p.desconto * 100)}%
                    </span>
                  )}
                  <p className="text-sm font-bold mt-2" style={{ color: 'var(--text-primary)' }}>{fmtBRL(valorComDesconto)}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Resumo */}
        <div className="rounded-xl p-4 md:p-5" style={{ background: '#10B98108', border: '1px solid #10B98130' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#10B981' }}>Resumo do pedido</p>
          <div className="space-y-2">
            {([
              ['Plano', planoEscolhido.label],
              ['Período', periodoEscolhido.label],
              ['Duração', `${periodoEscolhido.meses} meses`],
              periodoEscolhido.desconto > 0 ? ['Desconto', `-${Math.round(periodoEscolhido.desconto * 100)}%`] : null,
            ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, value]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid #10B98130' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Total</span>
              <span className="text-lg font-bold" style={{ color: '#10B981' }}>{fmtBRL(valorTotal)}</span>
            </div>
          </div>
        </div>

        <a href={gerarLinkWhatsApp()} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: '#10B981', color: '#fff' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#059669'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#10B981'}>
          <ExternalLink size={16} /> Solicitar renovação via WhatsApp
        </a>

        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <CheckCircle2 size={14} className="text-[#10B981] flex-shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Ao clicar, você será direcionado ao WhatsApp com sua solicitação pré-preenchida.
          </p>
        </div>

      </div>
    </div>
  )
}
