import { Smartphone } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function ReconexaoWhatsAppPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Reconexão WhatsApp</h1>
      <EmptyState
        titulo="WhatsApp desconectado"
        descricao="O fluxo de reconexão via QR Code será implementado aqui."
        icone={Smartphone}
      />
    </div>
  )
}
