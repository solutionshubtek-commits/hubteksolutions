import { MessageCircle } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

interface Props {
  params: { id: string }
}

export default function ConversaDetalhe({ params }: Props) {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Conversa #{params.id.slice(0, 8)}</h1>
      <EmptyState
        titulo="Visualizador de conversa"
        descricao="O histórico completo de mensagens será exibido aqui."
        icone={MessageCircle}
      />
    </div>
  )
}
