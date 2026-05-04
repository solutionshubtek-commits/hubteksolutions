import { History } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function HistoricoPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Histórico</h1>
      <EmptyState
        titulo="Nenhum histórico encontrado"
        descricao="O histórico de conversas encerradas aparecerá aqui."
        icone={History}
      />
    </div>
  )
}
