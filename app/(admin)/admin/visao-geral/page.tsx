import { LayoutDashboard } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

export default function AdminVisaoGeralPage() {
  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Visão Geral — Admin</h1>
      <EmptyState
        titulo="Painel consolidado"
        descricao="Métricas de todos os clientes serão exibidas aqui."
        icone={LayoutDashboard}
      />
    </div>
  )
}
