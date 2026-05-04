import { MessageCircle } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function ConversasPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Conversas</h1>
      <EmptyState
        titulo="Sem conversas ativas"
        descricao="As conversas em andamento aparecerão aqui."
        icone={MessageCircle}
      />
    </div>
  )
}
