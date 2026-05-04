import { Settings } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function ConfiguracoesPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Configurações</h1>
      <EmptyState
        titulo="Configurações do agente"
        descricao="As opções de configuração do agente serão disponibilizadas aqui."
        icone={Settings}
      />
    </div>
  )
}
