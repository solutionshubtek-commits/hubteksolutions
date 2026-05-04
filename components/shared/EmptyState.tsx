import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  titulo: string
  descricao: string
  icone?: LucideIcon
  className?: string
}

export function EmptyState({ titulo, descricao, icone: Icone, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-12',
        'flex flex-col items-center justify-center text-center',
        className
      )}
    >
      {Icone && (
        <div className="w-12 h-12 bg-[#10B981]/10 rounded-xl flex items-center justify-center mb-4">
          <Icone className="w-6 h-6 text-[#10B981]" />
        </div>
      )}
      <h3 className="text-white font-semibold text-lg mb-2">{titulo}</h3>
      <p className="text-[#A3A3A3] text-sm max-w-xs">{descricao}</p>
    </div>
  )
}
