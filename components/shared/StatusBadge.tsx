import { cn } from '@/lib/utils'

type Status =
  | 'ativo'
  | 'conectado'
  | 'agendado'
  | 'concluido'
  | 'pausado'
  | 'reagendado'
  | 'bloqueado'
  | 'banido'
  | 'cancelado'
  | 'encerrado'
  | 'desconectado'
  | 'inativo'

const statusConfig: Record<Status, { label: string; className: string }> = {
  ativo:        { label: 'Ativo',        className: 'bg-[#10B981]/10 text-[#10B981]' },
  conectado:    { label: 'Conectado',    className: 'bg-[#10B981]/10 text-[#10B981]' },
  agendado:     { label: 'Agendado',     className: 'bg-[#10B981]/10 text-[#10B981]' },
  concluido:    { label: 'Concluído',    className: 'bg-[#10B981]/10 text-[#10B981]' },
  pausado:      { label: 'Pausado',      className: 'bg-[#F59E0B]/10 text-[#F59E0B]' },
  reagendado:   { label: 'Reagendado',   className: 'bg-[#F59E0B]/10 text-[#F59E0B]' },
  bloqueado:    { label: 'Bloqueado',    className: 'bg-[#EF4444]/10 text-[#EF4444]' },
  banido:       { label: 'Banido',       className: 'bg-[#EF4444]/10 text-[#EF4444]' },
  cancelado:    { label: 'Cancelado',    className: 'bg-[#EF4444]/10 text-[#EF4444]' },
  encerrado:    { label: 'Encerrado',    className: 'bg-[#A3A3A3]/10 text-[#A3A3A3]' },
  desconectado: { label: 'Desconectado', className: 'bg-[#A3A3A3]/10 text-[#A3A3A3]' },
  inativo:      { label: 'Inativo',      className: 'bg-[#A3A3A3]/10 text-[#A3A3A3]' },
}

interface StatusBadgeProps {
  status: Status
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-[#A3A3A3]/10 text-[#A3A3A3]',
  }

  return (
    <span
      className={cn(
        'text-xs font-medium px-2 py-1 rounded-md',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
