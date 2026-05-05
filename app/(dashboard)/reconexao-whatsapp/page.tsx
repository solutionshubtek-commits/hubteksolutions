'use client'
import { useEffect, useState } from 'react'
import { Smartphone, CheckCircle, XCircle, RefreshCw } from 'lucide-react'

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

  async function fetchStatus() {
    try {
      const res = await fetch('/api/whatsapp/status')
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
      const res = await fetch('/api/whatsapp/qrcode')
      const data = await res.json()
      if (data.qrcode) setQrCode(data.qrcode)
    } finally {
      setGerandoQR(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const conectado = statusWA?.status === 'open'

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">WhatsApp</h1>

      <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6 max-w-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-[#10B981]/10 flex items-center justify-center">
            <Smartphone size={24} color="#10B981" />
          </div>
          <div>
            <p className="text-white font-semibold">Instância hubtek</p>
            {carregando ? (
              <p className="text-[#6B6B6B] text-sm">Verificando status...</p>
            ) : conectado ? (
              <p className="text-[#A3A3A3] text-sm">{statusWA?.nome || statusWA?.numero}</p>
            ) : (
              <p className="text-[#A3A3A3] text-sm">Desconectado</p>
            )}
          </div>
          <div className="ml-auto">
            {carregando ? null : conectado ? (
              <div className="flex items-center gap-1.5 text-[#10B981] text-sm">
                <CheckCircle size={16} />
                Conectado
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[#EF4444] text-sm">
                <XCircle size={16} />
                Desconectado
              </div>
            )}
          </div>
        </div>

        {!conectado && (
          <div className="space-y-4">
            <button
              onClick={gerarQRCode}
              disabled={gerandoQR}
              className="w-full bg-[#10B981] hover:bg-[#059669] disabled:opacity-50
                text-white font-semibold py-3 rounded-lg transition-all duration-200
                flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} className={gerandoQR ? 'animate-spin' : ''} />
              {gerandoQR ? 'Gerando QR Code...' : 'Gerar QR Code'}
            </button>

            {qrCode && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl">
                <img src={qrCode} alt="QR Code WhatsApp" className="w-48 h-48" />
                <p className="text-black text-xs text-center">
                  Escaneie com o WhatsApp para conectar
                </p>
              </div>
            )}
          </div>
        )}

        {conectado && (
          <button
            onClick={fetchStatus}
            className="flex items-center gap-2 text-[#A3A3A3] text-sm hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
            Atualizar status
          </button>
        )}
      </div>
    </div>
  )
}
