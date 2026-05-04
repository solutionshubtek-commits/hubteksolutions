import { LayoutDashboard } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function VisaoGeralPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Visão Geral</h1>
      <EmptyState
        titulo="Em desenvolvimento"
        descricao="O dashboard de métricas será implementado na próxima fase."
        icone={LayoutDashboard}
      />
    </div>
  )
}
