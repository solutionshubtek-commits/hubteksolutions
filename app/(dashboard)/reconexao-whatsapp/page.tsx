'use client'
import { useEffect, useState } from 'react'
import { Smartphone, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

interface StatusWA {
  status: string
  numero: string
  nome: string
}

export default function ReconexaoWhatsAppPage() {
  const [statusWA, setStatusWA] = useState<StatusWA | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [gerandoQR, setGerandoQR] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [instanceName, setInstanceName] = useState<string>('hubtek')
  const [nomeInstancia, setNomeInstancia] = useState<string>('hubtek')

  useEffect(() => {
    async function carregarInstancia() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (!userData?.tenant_id) return

      const { data: tenant } = await supabase
        .from('tenants')
        .select('instance_name, nome')
        .eq('id', userData.tenant_id)
        .single()

      if (tenant?.instance_name) {
        setInstanceName(tenant.instance_name)
        setNomeInstancia(tenant.instance_name)
      } else if (tenant?.nome) {
        setNomeInstancia(tenant.nome)
      }
    }

    carregarInstancia()
  }, [])

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/whatsapp/status?instance=${instanceName}`)
      const data = await res.json()
      setStatusWA(data)
    } catch {
      setStatusWA({ status: 'desconectado', numero: '', nome: '' })
    } finally {
      setCarregando(false)
    }
  }

  async function gerarQRCode() {
    setGerandoQR(true)
    setQrCode(null)
    try {
      const res = await fetch(`/api/whatsapp/qrcode?instance=${instanceName}`)
      const data = await res.json()
      if (data.qrcode) setQrCode(data.qrcode)
    } finally {
      setGerandoQR(false)
    }
  }

  useEffect(() => {
    if (instanceName) fetchStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceName])

  const conectado = statusWA?.status === 'open'

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>WhatsApp</h1>

      <div className="rounded-xl p-6 max-w-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.1)' }}>
            <Smartphone size={24} color="#10B981" />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Instância {nomeInstancia}</p>
            {carregando ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Verificando status...</p>
            ) : conectado ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{statusWA?.nome || statusWA?.numero}</p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Desconectado</p>
            )}
          </div>
          <div className="ml-auto">
            {!carregando && (conectado ? (
              <div className="flex items-center gap-1.5 text-[#10B981] text-sm">
                <CheckCircle size={16} /> Conectado
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-red-400 text-sm">
                <XCircle size={16} /> Desconectado
              </div>
            ))}
          </div>
        </div>

        {!conectado && (
          <div className="space-y-4">
            <button
              onClick={gerarQRCode}
              disabled={gerandoQR}
              className="w-full bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} className={gerandoQR ? 'animate-spin' : ''} />
              {gerandoQR ? 'Gerando QR Code...' : 'Gerar QR Code'}
            </button>
            {qrCode && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl">
                <Image src={qrCode} alt="QR Code WhatsApp" width={192} height={192} unoptimized />
                <p className="text-black text-xs text-center">Escaneie com o WhatsApp para conectar</p>
              </div>
            )}
          </div>
        )}

        {conectado && (
          <button onClick={fetchStatus}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
          >
            <RefreshCw size={14} /> Atualizar status
          </button>
        )}
      </div>
    </div>
  )
}
