import { acessoDoUsuarioLogado } from '@/lib/auth/plano-servidor'
import { temRecursoOuCortesia } from '@/lib/planos'
import RecursoBloqueado from '@/components/dashboard/RecursoBloqueado'

/**
 * Gate dos Agendamentos — liberado a partir do Essencial.
 *
 * Mesma abordagem do CRM: checagem no servidor, no layout, sem tocar a página.
 *
 * ATENÇÃO ao ligar isto para um cliente que já usava agenda: as tarefas
 * agendadas seguem rodando pelos crons (gerar-lembretes, scheduled-tasks,
 * sync-calendar), que não passam por este gate. Bloquear a tela não cancela
 * lembrete já marcado — e não deveria, senão um downgrade silencioso deixaria
 * o cliente final sem a confirmação que foi prometida a ele.
 */
export default async function AgendamentosLayout({ children }: { children: React.ReactNode }) {
  const { plano, cortesiaAte } = await acessoDoUsuarioLogado()

  if (!plano || !temRecursoOuCortesia(plano, 'agendamentos', cortesiaAte)) {
    return (
      <RecursoBloqueado
        recurso="agendamentos"
        planoAtual={plano ?? 'iniciante'}
        beneficios={[
          'O agente marca horários direto na conversa, sem você intervir',
          'Confirmação automática antes do compromisso, reduzindo falta',
          'Recontato de quem sumiu no meio da conversa',
          'Agenda sincronizada com o Google Calendar da sua equipe',
        ]}
      />
    )
  }

  return <>{children}</>
}
