import { Users } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function ClientesPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Clientes</h1>
      <EmptyState
        titulo="Nenhum cliente cadastrado"
        descricao="A gestão de tenants será implementada aqui."
        icone={Users}
      />
    </div>
  )
}
