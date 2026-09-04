'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Clock, Lock } from 'lucide-react'
import { statusComercialDe } from '@/lib/ciclo-vida'

/**
 * Destino do operador quando o plano do cliente vence (ou o cliente é
 * cancelado). O middleware redireciona para cá e mantém aqui — o operador não
 * pode renovar nem falar de contrato, então a tela só explica o que houve e
 * aponta para quem resolve: o gestor da conta.
 *
 * `admin_tenant` e `admin_hubtek` nunca chegam nesta tela: eles continuam com
 * acesso normal justamente para renovar e fechar o ciclo.
 */
export default function AcessoExpiradoPage() {
  const [nome, setNome] = useState<string | null>(null)
  const [cancelado, setCancelado] = useState(false)
  const [expiraEm, setExpiraEm] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase
        .from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) return
      const { data: tenant } = await supabase
        .from('tenants')
        .select('nome, expira_em, status_comercial')
        .eq('id', userData.tenant_id)
        .single()
      if (tenant) {
        setNome(tenant.nome)
        setExpiraEm(tenant.expira_em)
        setCancelado(statusComercialDe(tenant.status_comercial) !== 'ativo')
      }
    }
    fetchData()
  }, [])

  return (
    <div className="p-8 flex justify-center">
      <div className="w-full max-w-lg mt-8 rounded-xl p-8 text-center"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: '#EF444415', border: '1px solid #EF444430' }}>
          {cancelado ? <Lock size={22} className="text-red-400" /> : <Clock size={22} className="text-red-400" />}
        </div>

        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          {cancelado ? 'Conta sem acesso liberado' : 'Acesso expirado'}
        </h1>

        <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
          {cancelado ? (
            <>O acesso à dashboard {nome ? <strong>de {nome}</strong> : ''} está suspenso no momento.</>
          ) : (
            <>
              O plano {nome ? <strong>de {nome}</strong> : 'desta conta'} venceu
              {expiraEm && ` em ${new Date(expiraEm).toLocaleDateString('pt-BR')}`} e
              o atendimento automático foi pausado.
            </>
          )}
        </p>

        <div className="rounded-lg p-4 mb-6 text-left flex gap-3"
          style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
          <AlertTriangle size={16} className="text-[#F59E0B] shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Nenhum dado foi perdido. Conversas, agendamentos e histórico continuam
            preservados e voltam a ficar disponíveis assim que o acesso for
            regularizado.
          </p>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Solicite à gestão da sua empresa que entre em contato com a
          <strong style={{ color: 'var(--text-secondary)' }}> Hubtek Solutions</strong> para
          regularizar o acesso.
        </p>
      </div>
    </div>
  )
}
