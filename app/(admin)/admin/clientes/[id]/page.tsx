import { Users } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

interface Props {
  params: { id: string }
}

export default function ClienteDetalhePage({ params }: Props) {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Cliente #{params.id.slice(0, 8)}</h1>
      <EmptyState
        titulo="Detalhe do cliente"
        descricao="As informações completas do cliente serão exibidas aqui."
        icone={Users}
      />
    </div>
  )
}
