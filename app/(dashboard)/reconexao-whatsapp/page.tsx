'use client'
import { useEffect, useState } from 'react'
import { Smartphone, CheckCircle, XCircle, RefreshCw, Wifi, LogOut, ShieldAlert, MessageCircle, Trash2 } from 'lucide-react'
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
  const [excluindo, setExcluindo] = useState<Record<string, boolean>>({})
  const [confirmExcluir, setConfirmExcluir] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
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
    } catch { setInstancias([]) }
    finally { setCarregando(false) }
  }

  async function gerarQRCode(instanceName: string) {
    setGerandoQR(prev => ({ ...prev, [instanceName]: true }))
    setQrCodes(prev => ({ ...prev, [instanceName]: null }))
    try {
      const res = await fetch(`/api/whatsapp/qrcode?instance=${instanceName}`)
      const data = await res.json()
      setQrCodes(prev => ({ ...prev, [instanceName]: data.qrcode || null }))
    } finally { setGerandoQR(prev => ({ ...prev, [instanceName]: false })) }
  }

  async function desconectar(instanceName: string) {
    setDesconectando(prev => ({ ...prev, [instanceName]: true }))
    setConfirmDesconectar(null)
    try {
      const res = await fetch('/api/whatsapp/desconectar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_name: instanceName }),
      })
      if (res.ok && tenantId) { setQrCodes(prev => ({ ...prev, [instanceName]: null })); await fetchInstancias(tenantId) }
    } finally { setDesconectando(prev => ({ ...prev, [instanceName]: false })) }
  }

  async function excluirInstancia(instanceName: string) {
    if (!tenantId) return
    setExcluindo(prev => ({ ...prev, [instanceName]: true }))
    setConfirmExcluir(null)
    try {
      await fetch('/api/admin/deletar-instancia', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_name: instanceName, tenant_id: tenantId }),
      })
      await fetchInstancias(tenantId)
    } finally { setExcluindo(prev => ({ ...prev, [instanceName]: false })) }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>WhatsApp</h1>
        {tenantId && (
          <button onClick={() => fetchInstancias(tenantId)}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <RefreshCw size={14} /> Atualizar
          </button>
        )}
      </div>

      {carregando ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)' }} />)}
        </div>
      ) : instancias.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <Wifi size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma instância configurada.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Entre em contato com o suporte.</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-lg">
          {instancias.map(inst => {
            const conectado           = inst.status === 'open' || inst.status === 'conectado'
            const banido              = inst.status === 'banido'
            const qr                  = qrCodes[inst.instance_name]
            const gerando             = gerandoQR[inst.instance_name] ?? false
            const estaDesconectando   = desconectando[inst.instance_name] ?? false
            const pedindoConfirm      = confirmDesconectar === inst.instance_name
            const estaExcluindo       = excluindo[inst.instance_name] ?? false
            const pedindoConfirmExcluir = confirmExcluir === inst.instance_name

            return (
              <div key={inst.id} className="rounded-xl p-4 md:p-6"
                style={{ background: banido ? '#EF444408' : 'var(--bg-surface)', border: banido ? '1px solid #EF444430' : '1px solid var(--border)' }}>

                <div className="flex items-center gap-3 md:gap-4 mb-4">
                  <div className="w-10 md:w-12 h-10 md:h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: banido ? '#EF444415' : 'rgba(16,185,129,0.1)' }}>
                    {banido ? <ShieldAlert size={22} color="#EF4444" /> : <Smartphone size={22} color="#10B981" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm md:text-base" style={{ color: 'var(--text-primary)' }}>{inst.apelido}</p>
                    <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{inst.instance_name}</p>
                    {conectado && inst.nome && (
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {inst.nome}{inst.numero ? ` · ${inst.numero}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {conectado ? (
                      <div className="flex items-center gap-1.5 text-[#10B981] text-sm"><CheckCircle size={15} /> Conectado</div>
                    ) : banido ? (
                      <div className="flex items-center gap-1.5 text-red-400 text-sm font-semibold"><ShieldAlert size={15} /> Banido</div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-400 text-sm"><XCircle size={15} /> Desconectado</div>
                    )}
                  </div>
                </div>

                {banido && (
                  <div className="rounded-lg p-4 mb-3 space-y-3" style={{ background: '#EF444410', border: '1px solid #EF444430' }}>
                    <div className="flex items-start gap-2">
                      <ShieldAlert size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-400">Número banido pelo WhatsApp</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Este número foi bloqueado e não pode mais enviar mensagens. Conecte um novo número.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!pedindoConfirm && (
                        <button onClick={() => setConfirmDesconectar(inst.instance_name)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg"
                          style={{ background: 'var(--bg-surface)', border: '1px solid #EF444440', color: '#EF4444' }}>
                          <LogOut size={13} /> Desconectar
                        </button>
                      )}
                      <a href="https://wa.me/5551980104924" target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg"
                        style={{ background: '#10B98115', border: '1px solid #10B98130', color: '#10B981' }}>
                        <MessageCircle size={13} /> Suporte
                      </a>
                    </div>
                  </div>
                )}

                {(conectado || banido) && pedindoConfirm && (
                  <div className="rounded-lg p-4 space-y-3 mb-3" style={{ background: '#EF444410', border: '1px solid #EF444430' }}>
                    <p className="text-sm font-medium text-red-400">Tem certeza que deseja desconectar?</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>O agente ficará inativo até nova conexão.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDesconectar(null)}
                        className="flex-1 text-sm font-medium py-2 rounded-lg"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        Cancelar
                      </button>
                      <button onClick={() => desconectar(inst.instance_name)} disabled={estaDesconectando}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg">
                        <LogOut size={13} className={estaDesconectando ? 'animate-spin' : ''} />
                        {estaDesconectando ? 'Aguarde...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}

                {conectado && !pedindoConfirm && (
                  <button onClick={() => setConfirmDesconectar(inst.instance_name)}
                    className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg"
                    style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <LogOut size={14} /> Desconectar número
                  </button>
                )}

                {!conectado && !banido && (
                  <div className="space-y-3">
                    <button onClick={() => gerarQRCode(inst.instance_name)} disabled={gerando}
                      className="w-full bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm">
                      <RefreshCw size={15} className={gerando ? 'animate-spin' : ''} />
                      {gerando ? 'Gerando QR Code...' : 'Gerar QR Code'}
                    </button>

                    {qr && (
                      <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl">
                        <Image src={qr} alt="QR Code WhatsApp" width={192} height={192} unoptimized />
                        <p className="text-black text-xs text-center">Escaneie com o WhatsApp para conectar</p>
                      </div>
                    )}

                    {pedindoConfirmExcluir ? (
                      <div className="rounded-lg p-4 space-y-3" style={{ background: '#EF444410', border: '1px solid #EF444430' }}>
                        <p className="text-sm font-medium text-red-400">Excluir &quot;{inst.apelido}&quot; permanentemente?</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Esta ação não pode ser desfeita.</p>
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmExcluir(null)}
                            className="flex-1 text-sm font-medium py-2 rounded-lg"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                            Cancelar
                          </button>
                          <button onClick={() => excluirInstancia(inst.instance_name)} disabled={estaExcluindo}
                            className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg">
                            <Trash2 size={13} className={estaExcluindo ? 'animate-spin' : ''} />
                            {estaExcluindo ? 'Excluindo...' : 'Confirmar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmExcluir(inst.instance_name)}
                        className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2 rounded-lg"
                        style={{ background: 'var(--bg-surface-2)', border: '1px solid #EF444430', color: '#EF4444' }}>
                        <Trash2 size={14} /> Excluir instância
                      </button>
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
