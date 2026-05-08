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
        'rounded-xl p-12',
        'flex flex-col items-center justify-center text-center',
        className
      )}
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {Icone && (
        <div className="w-12 h-12 bg-[#10B981]/10 rounded-xl flex items-center justify-center mb-4">
          <Icone className="w-6 h-6 text-[#10B981]" />
        </div>
      )}
      <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>{titulo}</h3>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>{descricao}</p>
    </div>
  )
}
