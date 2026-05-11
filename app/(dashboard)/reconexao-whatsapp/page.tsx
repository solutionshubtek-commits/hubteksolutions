'use client'
import { useEffect, useState } from 'react'
import { Smartphone, CheckCircle, XCircle, RefreshCw, Wifi, LogOut } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

interface Instancia {
  id: string
  instance_name: string
  apelido: string
  status: string
  numero: string
  nome: string
}

export default function ReconexaoWhatsAppPage() {
  const [instancias, setInstancias] = useState<Instancia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [qrCodes, setQrCodes] = useState<Record<string, string | null>>({})
  const [gerandoQR, setGerandoQR] = useState<Record<string, boolean>>({})
  const [desconectando, setDesconectando] = useState<Record<string, boolean>>({})
  const [confirmDesconectar, setConfirmDesconectar] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (!userData?.tenant_id) return
      setTenantId(userData.tenant_id)
      await fetchInstancias(userData.tenant_id)
    }
    carregar()
  }, [])

  async function fetchInstancias(tid: string) {
    setCarregando(true)
    try {
      const res = await fetch(`/api/whatsapp/status?tenant_id=${tid}`)
      const data = await res.json()
      setInstancias(data.instancias ?? [])
    } catch {
      setInstancias([])
    } finally {
      setCarregando(false)
    }
  }

  async function gerarQRCode(instanceName: string) {
    setGerandoQR(prev => ({ ...prev, [instanceName]: true }))
    setQrCodes(prev => ({ ...prev, [instanceName]: null }))
    try {
      const res = await fetch(`/api/whatsapp/qrcode?instance=${instanceName}`)
      const data = await res.json()
      setQrCodes(prev => ({ ...prev, [instanceName]: data.qrcode || null }))
    } finally {
      setGerandoQR(prev => ({ ...prev, [instanceName]: false }))
    }
  }

  async function desconectar(instanceName: string) {
    setDesconectando(prev => ({ ...prev, [instanceName]: true }))
    setConfirmDesconectar(null)
    try {
      const res = await fetch('/api/whatsapp/desconectar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_name: instanceName }),
      })
      if (res.ok && tenantId) {
        // Limpa QR anterior e recarrega status
        setQrCodes(prev => ({ ...prev, [instanceName]: null }))
        await fetchInstancias(tenantId)
      }
    } finally {
      setDesconectando(prev => ({ ...prev, [instanceName]: false }))
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>WhatsApp</h1>
        {tenantId && (
          <button
            onClick={() => fetchInstancias(tenantId)}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        )}
      </div>

      {carregando ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)' }} />
          ))}
        </div>
      ) : instancias.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <Wifi size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma instância configurada.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Entre em contato com o suporte para configurar seu WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-lg">
          {instancias.map(inst => {
            const conectado = inst.status === 'open' || inst.status === 'conectado'
            const qr = qrCodes[inst.instance_name]
            const gerando = gerandoQR[inst.instance_name] ?? false
            const estaDesconectando = desconectando[inst.instance_name] ?? false
            const pedindoConfirm = confirmDesconectar === inst.instance_name

            return (
              <div key={inst.id} className="rounded-xl p-6"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

                {/* Header da instância */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <Smartphone size={24} color="#10B981" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{inst.apelido}</p>
                    <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{inst.instance_name}</p>
                    {conectado && inst.nome && (
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {inst.nome}{inst.numero ? ` · ${inst.numero}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {conectado ? (
                      <div className="flex items-center gap-1.5 text-[#10B981] text-sm">
                        <CheckCircle size={16} /> Conectado
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-400 text-sm">
                        <XCircle size={16} /> Desconectado
                      </div>
                    )}
                  </div>
                </div>

                {/* Instância conectada: botão desconectar */}
                {conectado && (
                  <div className="space-y-2">
                    {!pedindoConfirm ? (
                      <button
                        onClick={() => setConfirmDesconectar(inst.instance_name)}
                        className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-colors"
                        style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        <LogOut size={14} /> Desconectar número
                      </button>
                    ) : (
                      <div className="rounded-lg p-4 space-y-3"
                        style={{ background: '#EF444410', border: '1px solid #EF444430' }}>
                        <p className="text-sm font-medium text-red-400">Tem certeza que deseja desconectar?</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          O número será desvinculado e o agente ficará inativo até uma nova conexão.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDesconectar(null)}
                            className="flex-1 text-sm font-medium py-2 rounded-lg transition-colors"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => desconectar(inst.instance_name)}
                            disabled={estaDesconectando}
                            className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                          >
                            <LogOut size={13} className={estaDesconectando ? 'animate-spin' : ''} />
                            {estaDesconectando ? 'Desconectando...' : 'Confirmar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Instância desconectada: gerar QR */}
                {!conectado && (
                  <div className="space-y-3">
                    <button
                      onClick={() => gerarQRCode(inst.instance_name)}
                      disabled={gerando}
                      className="w-full bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      <RefreshCw size={15} className={gerando ? 'animate-spin' : ''} />
                      {gerando ? 'Gerando QR Code...' : 'Gerar QR Code'}
                    </button>
                    {qr && (
                      <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl">
                        <Image src={qr} alt="QR Code WhatsApp" width={192} height={192} unoptimized />
                        <p className="text-black text-xs text-center">Escaneie com o WhatsApp para conectar</p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
