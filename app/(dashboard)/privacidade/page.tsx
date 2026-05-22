'use client'

export default function PrivacidadePage() {
  const dataAtualizacao = '22 de maio de 2026'

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Política de Privacidade
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Última atualização: {dataAtualizacao}
        </p>
      </div>

      <div className="rounded-xl p-6 md:p-8 space-y-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>1. Controlador dos Dados</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            A <strong style={{ color: 'var(--text-primary)' }}>Hubtek Solutions</strong>, CNPJ 52.926.918/0001-60, razão social <strong style={{ color: 'var(--text-primary)' }}>52.926.918 ROBSON DE OLIVEIRA</strong>, é a controladora dos dados pessoais coletados por meio desta plataforma, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Encarregado de Proteção de Dados (DPO): <a href="mailto:solutionshubtek@gmail.com" style={{ color: '#10B981' }}>solutionshubtek@gmail.com</a>
          </p>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>2. Dados Coletados</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p><strong style={{ color: 'var(--text-primary)' }}>Dados dos usuários da plataforma (clientes Hubtek):</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Nome, e-mail e credenciais de acesso</li>
              <li>Registros de acesso e atividades na plataforma (logs)</li>
            </ul>
            <p className="mt-3"><strong style={{ color: 'var(--text-primary)' }}>Dados dos contatos finais (clientes dos nossos clientes):</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Número de telefone e nome de perfil do WhatsApp</li>
              <li>Conteúdo das mensagens trocadas com o agente</li>
              <li>Transcrições de áudios enviados</li>
              <li>Descrições de imagens enviadas</li>
              <li>Preferências e informações mencionadas espontaneamente durante o atendimento</li>
            </ul>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>3. Finalidade do Tratamento</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>Os dados são tratados para as seguintes finalidades:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Prestação do serviço de atendimento automatizado via WhatsApp</li>
              <li>Personalização do atendimento com base no histórico do contato</li>
              <li>Gestão de agendamentos e recontatos</li>
              <li>Monitoramento de qualidade e melhoria contínua do serviço</li>
              <li>Cumprimento de obrigações legais e regulatórias</li>
            </ul>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>4. Base Legal</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>O tratamento de dados é fundamentado nas seguintes bases legais previstas na LGPD:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong style={{ color: 'var(--text-primary)' }}>Execução de contrato</strong> (art. 7º, V) — para prestação do serviço contratado</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>Legítimo interesse</strong> (art. 7º, IX) — para personalização e melhoria do atendimento</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>Cumprimento de obrigação legal</strong> (art. 7º, II) — quando exigido por lei</li>
            </ul>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>5. Compartilhamento com Terceiros</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>Os dados podem ser compartilhados com os seguintes operadores, exclusivamente para viabilizar a prestação do serviço:</p>

            <div className="rounded-lg overflow-hidden mt-3" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Operador</th>
                    <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Finalidade</th>
                    <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>País</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { op: 'Supabase', fin: 'Armazenamento de dados e autenticação', pais: 'EUA' },
                    { op: 'Vercel', fin: 'Hospedagem da aplicação', pais: 'EUA' },
                    { op: 'OpenAI', fin: 'Processamento de linguagem natural e transcrição de áudio', pais: 'EUA' },
                    { op: 'Anthropic', fin: 'Processamento de linguagem natural (backup)', pais: 'EUA' },
                    { op: 'Meta (WhatsApp)', fin: 'Envio e recebimento de mensagens', pais: 'EUA' },
                    { op: 'Resend', fin: 'Envio de e-mails transacionais', pais: 'EUA' },
                    { op: 'Upstash', fin: 'Cache e controle de taxa de requisições', pais: 'EUA' },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < 6 ? '1px solid var(--border)' : 'none' }}>
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{row.op}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{row.fin}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{row.pais}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2">
              A transferência internacional de dados para os operadores listados acima é realizada com base em cláusulas contratuais padrão e/ou políticas de privacidade compatíveis com a LGPD.
            </p>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>6. Retenção dos Dados</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Conversas e mensagens: 90 dias em produção, arquivadas por até 1 ano</li>
              <li>Logs de ações: 90 dias em produção, arquivados por até 1 ano</li>
              <li>Perfis de contatos: mantidos enquanto o contrato estiver ativo</li>
              <li>Dados de usuários da plataforma: mantidos enquanto a conta estiver ativa e por até 90 dias após o encerramento</li>
            </ul>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>7. Direitos dos Titulares</h2>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>Nos termos da LGPD, os titulares de dados têm direito a:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Confirmar a existência de tratamento de seus dados</li>
              <li>Acessar os dados que possuímos sobre eles</li>
              <li>Solicitar correção de dados incompletos ou incorretos</li>
              <li>Solicitar a eliminação de dados desnecessários</li>
              <li>Obter informações sobre o compartilhamento realizado</li>
              <li>Revogar o consentimento, quando aplicável</li>
            </ul>
            <p className="mt-2">
              Solicitações podem ser enviadas para{' '}
              <a href="mailto:solutionshubtek@gmail.com" style={{ color: '#10B981' }}>
                solutionshubtek@gmail.com
              </a>{' '}
              e serão respondidas em até 15 dias úteis.
            </p>
          </div>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>8. Segurança</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, perda ou alteração, incluindo: autenticação segura, controle de acesso por perfil (RLS), criptografia em trânsito (HTTPS/TLS) e isolamento de dados por tenant.
          </p>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>9. Cookies e Rastreamento</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            A plataforma utiliza cookies estritamente necessários para autenticação e funcionamento da sessão. Não utilizamos cookies de rastreamento publicitário ou ferramentas de análise comportamental de terceiros.
          </p>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>10. Alterações desta Política</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Esta Política pode ser atualizada periodicamente. Alterações relevantes serão comunicadas com antecedência mínima de 15 dias. A versão vigente estará sempre disponível nesta página.
          </p>
        </section>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>11. Contato</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Para exercer seus direitos ou esclarecer dúvidas sobre esta Política, entre em contato com nosso encarregado pelo e-mail{' '}
            <a href="mailto:solutionshubtek@gmail.com" style={{ color: '#10B981' }}>
              solutionshubtek@gmail.com
            </a>.
          </p>
        </section>

      </div>
    </div>
  )
}