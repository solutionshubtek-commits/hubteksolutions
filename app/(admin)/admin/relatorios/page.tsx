import { FileText } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function RelatoriosPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Relatórios</h1>
      <EmptyState
        titulo="Nenhum relatório disponível"
        descricao="Relatórios mensais fechados serão listados aqui."
        icone={FileText}
      />
    </div>
  )
}
