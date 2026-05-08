import { FileText } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function RelatoriosPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Relatórios</h1>
      <EmptyState
        titulo="Nenhum relatório disponível"
        descricao="Relatórios mensais fechados serão listados aqui."
        icone={FileText}
      />
    </div>
  )
}
