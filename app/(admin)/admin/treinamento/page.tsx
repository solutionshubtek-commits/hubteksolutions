import { Bot } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function TreinamentoPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Treinamento</h1>
      <EmptyState
        titulo="Base de conhecimento vazia"
        descricao="O gerenciamento de prompts e documentos de treinamento será implementado aqui."
        icone={Bot}
      />
    </div>
  )
}
