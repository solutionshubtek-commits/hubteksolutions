'use client'

export default function TermosDeUsoPage() {
  const dataAtualizacao = '22 de maio de 2026'

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Termos de Uso
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Última atualização: {dataAtualizacao}
        </p>
      </div>

      <div className="rounded-xl p-6 md:p-8 space-y-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>1. Das Partes</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            O presente instrumento regula a relação entre a <strong style={{ color: 'var(--text-primary)' }}>Hubtek Solutions</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 52.926.918/0001-60, razão social <strong style={{ color: 'var(--text-primary)' }}>52.926.918 ROBSON DE OLIVEIRA</strong>, doravante denominada <strong style={{ color: 'var(--text-primary)' }}>CONTRATADA</strong>, e o usuário ou empresa que acessa e utiliza a plataforma, doravante denominado <strong style={{ color: 'var(--text-primary)' }}>CONTRATANTE</strong>.
          </p>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>2. Do Objeto</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            A Hubtek Solutions disponibiliza uma plataforma SaaS (Software como Serviço) de automação de atendimento via WhatsApp, com recursos de agente de inteligência artificial, gestão de conversas, agendamentos, base de conhecimento e painel de controle, conforme o plano contratado.
          </p>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>3. Do Acesso e Uso</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>3.1. O acesso à plataforma é pessoal e intransferível. O CONTRATANTE é responsável por manter a confidencialidade de suas credenciais de acesso.</p>
            <p>3.2. É vedado ao CONTRATANTE: (a) sublicenciar, revender ou redistribuir o serviço sem autorização expressa; (b) utilizar a plataforma para envio de spam ou mensagens não solicitadas; (c) tentar acessar sistemas ou dados de outros usuários; (d) realizar engenharia reversa ou extração do código-fonte da plataforma.</p>
            <p>3.3. O CONTRATANTE é integralmente responsável pelo conteúdo das mensagens enviadas por meio da plataforma e pelo uso que seus operadores fazem do sistema.</p>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>4. Dos Planos e Pagamentos</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>4.1. A plataforma é oferecida em planos mensais com limites de conversas conforme descrito no momento da contratação.</p>
            <p>4.2. O não pagamento na data de vencimento poderá resultar na suspensão do acesso até a regularização.</p>
            <p>4.3. Não há reembolso proporcional em caso de cancelamento antecipado dentro do ciclo vigente.</p>
            <p>4.4. A Hubtek Solutions reserva-se o direito de reajustar os valores dos planos mediante aviso prévio de 30 (trinta) dias.</p>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>5. Da Disponibilidade do Serviço</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>5.1. A Hubtek Solutions envidará seus melhores esforços para manter a plataforma disponível de forma contínua, mas não garante disponibilidade ininterrupta.</p>
            <p>5.2. Manutenções programadas serão comunicadas com antecedência sempre que possível.</p>
            <p>5.3. A Hubtek Solutions não se responsabiliza por indisponibilidades decorrentes de falhas em serviços de terceiros, incluindo WhatsApp, provedores de inteligência artificial e infraestrutura de nuvem.</p>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>6. Das Integrações com Terceiros</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>6.1. A plataforma utiliza serviços de terceiros para processamento de inteligência artificial (OpenAI e Anthropic), infraestrutura de nuvem e envio de mensagens. O uso desses serviços está sujeito às políticas dos respectivos provedores.</p>
            <p>6.2. O uso da plataforma para envio de mensagens via WhatsApp deve respeitar os Termos de Serviço do WhatsApp Business. O CONTRATANTE é responsável por garantir que seu uso está em conformidade com tais termos.</p>
            <p>6.3. O banimento de números de WhatsApp por violação das políticas da Meta é de responsabilidade exclusiva do CONTRATANTE.</p>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>7. Da Limitação de Responsabilidade</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>7.1. A Hubtek Solutions não se responsabiliza por danos indiretos, lucros cessantes ou perdas decorrentes do uso ou impossibilidade de uso da plataforma.</p>
            <p>7.2. A responsabilidade total da Hubtek Solutions, em qualquer hipótese, fica limitada ao valor pago pelo CONTRATANTE no mês em que ocorreu o evento danoso.</p>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>8. Da Vigência e Rescisão</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>8.1. O contrato vigora pelo período do plano contratado, renovando-se automaticamente salvo manifestação em contrário.</p>
            <p>8.2. Qualquer das partes pode rescindir o contrato mediante aviso prévio de 30 (trinta) dias.</p>
            <p>8.3. A Hubtek Solutions pode rescindir imediatamente em caso de violação destes Termos pelo CONTRATANTE.</p>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>9. Das Alterações</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            A Hubtek Solutions pode alterar estes Termos a qualquer momento, comunicando os usuários com antecedência mínima de 15 (quinze) dias. O uso continuado da plataforma após a comunicação implica aceitação dos novos termos.
          </p>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>10. Do Foro</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Fica eleito o foro da comarca de Porto Alegre/RS para dirimir quaisquer controvérsias oriundas destes Termos, com renúncia a qualquer outro, por mais privilegiado que seja.
          </p>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>11. Do Contato</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Dúvidas sobre estes Termos podem ser enviadas para{' '}
            <a href="mailto:solutionshubtek@gmail.com" style={{ color: '#10B981' }}>
              solutionshubtek@gmail.com
            </a>.
          </p>
        </section>

      </div>
    </div>
  )
}