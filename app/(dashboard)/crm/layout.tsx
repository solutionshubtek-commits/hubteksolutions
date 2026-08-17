import { acessoDoUsuarioLogado } from '@/lib/auth/plano-servidor'
import { temRecursoOuCortesia } from '@/lib/planos'
import RecursoBloqueado from '@/components/dashboard/RecursoBloqueado'

/**
 * Gate do CRM — liberado a partir do Acelerador.
 *
 * Fica no layout, e não dentro da página, por dois motivos: a checagem roda no
 * servidor, então o cliente sem acesso nunca recebe o conteúdo nem vê um
 * flash do kanban antes do bloqueio; e a página, que é grande e cheia de
 * hooks, não precisa de nenhuma alteração.
 *
 * Os leads continuam sendo gravados normalmente para quem não tem o recurso
 * (ver upsertCRMLead em process-message). Quando o cliente faz upgrade, o CRM
 * nasce cheio com o histórico dele — sem isso, liberar o recurso entregaria
 * uma tela vazia justo no momento em que ele acabou de pagar mais.
 */
export default async function CRMLayout({ children }: { children: React.ReactNode }) {
  const { plano, cortesiaAte } = await acessoDoUsuarioLogado()

  if (!plano || !temRecursoOuCortesia(plano, 'crm', cortesiaAte)) {
    return (
      <RecursoBloqueado
        recurso="crm"
        planoAtual={plano ?? 'iniciante'}
        beneficios={[
          'Funil visual com todos os seus contatos, do primeiro contato ao fechamento',
          'Veja em que etapa cada lead parou e quanto tempo ele está lá',
          'Arraste os cards conforme a negociação avança, sem planilha paralela',
          'Seus contatos já vêm preenchidos: o agente registra cada atendimento desde hoje',
        ]}
      />
    )
  }

  return <>{children}</>
}
