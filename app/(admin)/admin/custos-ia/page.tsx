import { Wallet } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function CustosIAPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Custos de IA</h1>
      <EmptyState
        titulo="Nenhum ciclo de cobrança"
        descricao="O relatório de consumo de tokens por cliente será exibido aqui."
        icone={Wallet}
      />
    </div>
  )
}
