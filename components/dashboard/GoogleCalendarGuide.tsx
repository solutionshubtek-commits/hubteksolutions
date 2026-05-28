'use client'

import { useState } from 'react'
import { X, ChevronRight, ChevronLeft, CheckCircle2, ExternalLink, BookOpen } from 'lucide-react'

interface Step {
  number: number
  icon: string
  title: string
  content: React.ReactNode
}

const STEPS: Step[] = [
  {
    number: 1,
    icon: '🌐',
    title: 'Acessar o Google Cloud Console',
    content: (
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Acesse o console de gerenciamento do Google Cloud para criar as credenciais necessárias.
        </p>
        <a
          href="https://console.cloud.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: '#10B981' }}
        >
          <ExternalLink size={12} />
          console.cloud.google.com
        </a>
      </div>
    ),
  },
  {
    number: 2,
    icon: '⚡',
    title: 'Ativar a Google Calendar API',
    content: (
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          No menu lateral do console, siga o caminho:
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {['APIs e serviços', 'Biblioteca'].map((item, i, arr) => (
            <span key={item} className="flex items-center gap-1.5">
              <span className="text-xs font-medium px-2 py-1 rounded-lg"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {item}
              </span>
              {i < arr.length - 1 && <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
            </span>
          ))}
        </div>
        <ol className="space-y-2">
          {[
            <>Pesquise <strong style={{ color: 'var(--text-primary)' }}>Google Calendar API</strong></>,
            <>Clique na API → clique em <strong style={{ color: 'var(--text-primary)' }}>Ativar</strong></>,
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
      </div>
    ),
  },
  {
    number: 3,
    icon: '👤',
    title: 'Criar conta de serviço',
    content: (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {['APIs e serviços', 'Credenciais'].map((item, i, arr) => (
            <span key={item} className="flex items-center gap-1.5">
              <span className="text-xs font-medium px-2 py-1 rounded-lg"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {item}
              </span>
              {i < arr.length - 1 && <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
            </span>
          ))}
        </div>
        <ol className="space-y-2">
          {[
            <>Clique em <strong style={{ color: 'var(--text-primary)' }}>+ Criar credenciais</strong> → <strong style={{ color: 'var(--text-primary)' }}>Conta de serviço</strong></>,
            <>Preencha um nome (ex: <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>hubtek-calendar</code>) → <strong style={{ color: 'var(--text-primary)' }}>Criar e continuar</strong></>,
            <>Em &quot;Conceder acesso&quot; deixe em branco → <strong style={{ color: 'var(--text-primary)' }}>Continuar</strong> → <strong style={{ color: 'var(--text-primary)' }}>Concluído</strong></>,
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
      </div>
    ),
  },
  {
    number: 4,
    icon: '🔑',
    title: 'Gerar a chave JSON',
    content: (
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Na lista de contas de serviço, clique na conta que acabou de criar:
        </p>
        <ol className="space-y-2">
          {[
            <>Vá na aba <strong style={{ color: 'var(--text-primary)' }}>Chaves</strong></>,
            <>Clique em <strong style={{ color: 'var(--text-primary)' }}>Adicionar chave</strong> → <strong style={{ color: 'var(--text-primary)' }}>Criar nova chave</strong></>,
            <>Selecione <strong style={{ color: 'var(--text-primary)' }}>JSON</strong> → <strong style={{ color: 'var(--text-primary)' }}>Criar</strong></>,
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
          style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: 'var(--text-muted)' }}>
          <span className="flex-shrink-0">⚠️</span>
          <span>O arquivo JSON baixa automaticamente. Guarde-o em local seguro.</span>
        </div>
      </div>
    ),
  },
  {
    number: 5,
    icon: '📋',
    title: 'Extrair os campos do arquivo JSON',
    content: (
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Clique com botão direito no arquivo baixado → <strong style={{ color: 'var(--text-primary)' }}>Abrir com</strong> → <strong style={{ color: 'var(--text-primary)' }}>Bloco de Notas</strong>
        </p>
        <div className="rounded-lg px-3 py-2.5 font-mono text-[11px] overflow-x-auto"
          style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: '#10B981' }}>
          <pre className="whitespace-pre-wrap">{`{
  "client_email": "hubtek@proj.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n",
  ...
}`}</pre>
        </div>
        <div className="space-y-2">
          <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Copie o valor de </span>
            <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>client_email</code>
          </div>
          <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Copie o bloco inteiro de </span>
            <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>private_key</code>
            <span style={{ color: 'var(--text-muted)' }}> — incluindo os traços </span>
            <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>-----BEGIN</code>
            <span style={{ color: 'var(--text-muted)' }}> e </span>
            <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>END-----</code>
          </div>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--text-muted)' }}>
          <span className="flex-shrink-0">ℹ️</span>
          <span>Os demais campos do JSON <strong style={{ color: 'var(--text-secondary)' }}>não são usados</strong> — pode ignorar.</span>
        </div>
      </div>
    ),
  },
  {
    number: 6,
    icon: '📅',
    title: 'Compartilhar o Calendar com a conta de serviço',
    content: (
      <div className="space-y-3">
        <a
          href="https://calendar.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: '#10B981' }}
        >
          <ExternalLink size={12} />
          calendar.google.com
        </a>
        <ol className="space-y-2">
          {[
            <>No lado esquerdo, passe o mouse no calendário → clique nos <strong style={{ color: 'var(--text-primary)' }}>⋮ três pontinhos</strong> → <strong style={{ color: 'var(--text-primary)' }}>Configurações e compartilhamento</strong></>,
            <>Desça até <strong style={{ color: 'var(--text-primary)' }}>&quot;Compartilhar com pessoas específicas ou grupos&quot;</strong></>,
            <>Clique em <strong style={{ color: 'var(--text-primary)' }}>+ Adicionar participantes e grupos</strong></>,
            <>Cole o <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>client_email</code> → permissão: <strong style={{ color: 'var(--text-primary)' }}>&quot;Fazer alterações em eventos&quot;</strong> → <strong style={{ color: 'var(--text-primary)' }}>Enviar</strong></>,
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
      </div>
    ),
  },
  {
    number: 7,
    icon: '🔍',
    title: 'Obter o Calendar ID',
    content: (
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Na mesma tela de configurações que está aberta:
        </p>
        <ol className="space-y-2">
          {[
            <>Desça até a seção <strong style={{ color: 'var(--text-primary)' }}>&quot;Integrar agenda&quot;</strong></>,
            <>Copie o valor do campo <strong style={{ color: 'var(--text-primary)' }}>&quot;ID da agenda&quot;</strong></>,
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
        <div className="space-y-1.5">
          <div className="px-3 py-2 rounded-lg text-xs font-mono" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Calendário principal: </span>
            <span style={{ color: '#10B981' }}>seuEmail@gmail.com</span>
          </div>
          <div className="px-3 py-2 rounded-lg text-xs font-mono" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Secundário: </span>
            <span style={{ color: '#10B981' }}>abc123@group.calendar.google.com</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    number: 8,
    icon: '📝',
    title: 'Preencher na dashboard',
    content: (
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Nos campos abaixo desta janela, preencha:
        </p>
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Campo</th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Client Email', '...@...iam.gserviceaccount.com'],
                ['Private Key', '-----BEGIN...END PRIVATE KEY-----'],
                ['Calendar ID', 'ID copiado no passo 7'],
              ].map(([campo, valor], i, arr) => (
                <tr key={campo} style={i < arr.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{campo}</td>
                  <td className="px-3 py-2 font-mono text-[11px]" style={{ color: '#10B981' }}>{valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    number: 9,
    icon: '✅',
    title: 'Testar a conexão',
    content: (
      <div className="space-y-3">
        <ol className="space-y-2">
          {[
            <>Clique em <strong style={{ color: 'var(--text-primary)' }}>Testar conexão</strong></>,
            <><span style={{ color: '#10B981' }}>✓ &quot;Conexão com o Google Calendar funcionando!&quot;</span> → clique em <strong style={{ color: 'var(--text-primary)' }}>Salvar configurações</strong></>,
            <>Se aparecer erro → verifique se o <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>client_email</code> foi adicionado corretamente no <strong style={{ color: 'var(--text-primary)' }}>passo 6</strong></>,
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                style={i === 2
                  ? { background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }
                  : { background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                {i === 2 ? '!' : i + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <CheckCircle2 size={16} style={{ color: '#10B981', flexShrink: 0 }} />
          <div>
            <p className="text-xs font-semibold" style={{ color: '#10B981' }}>Pronto!</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              O agente já pode criar, confirmar, reagendar e cancelar eventos automaticamente.
            </p>
          </div>
        </div>
      </div>
    ),
  },
]

export function GoogleCalendarGuide() {
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const step = STEPS[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === STEPS.length - 1

  function openModal() { setOpen(true); setCurrentStep(0) }
  function closeModal() { setOpen(false) }

  return (
    <>
      {/* Trigger — mesmo visual do <details> que substitui */}
      <button
        onClick={openModal}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-left transition-colors"
        style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      >
        <BookOpen size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        📋 Como obter as credenciais (passo a passo)
        <ChevronRight size={12} className="ml-auto" style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div
            className="relative w-full max-w-md flex flex-col rounded-xl shadow-2xl"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              maxHeight: '90vh',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  📅
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Integração Google Calendar
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Passo {currentStep + 1} de {STEPS.length}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-hover)' }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Barra de progresso */}
            <div className="h-0.5 flex-shrink-0" style={{ background: 'var(--border)' }}>
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%`, background: '#10B981' }}
              />
            </div>

            {/* Dots de navegação */}
            <div className="px-5 pt-3.5 pb-1 flex items-center gap-1.5 flex-shrink-0 flex-wrap">
              {STEPS.map((s, i) => (
                <button
                  key={s.number}
                  onClick={() => setCurrentStep(i)}
                  title={`Passo ${s.number}: ${s.title}`}
                  className="transition-all duration-200 rounded-full"
                  style={{
                    width: i === currentStep ? 20 : 8,
                    height: 8,
                    background: i < currentStep
                      ? '#10B981'
                      : i === currentStep
                      ? '#10B981'
                      : 'var(--border)',
                    opacity: i < currentStep ? 0.6 : 1,
                  }}
                />
              ))}
              <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                {currentStep}/{STEPS.length - 1} ✓
              </span>
            </div>

            {/* Conteúdo do passo */}
            <div className="px-5 py-4 flex-1 overflow-y-auto">
              {/* Título do passo */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                  {step.icon}
                </div>
                <div className="pt-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    Passo {step.number}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {step.title}
                  </p>
                </div>
              </div>
              {step.content}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
              style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setCurrentStep(prev => prev - 1)}
                disabled={isFirst}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
              >
                <ChevronLeft size={13} /> Anterior
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={closeModal}
                  className="text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Fechar
                </button>

                {isLast ? (
                  <button
                    onClick={closeModal}
                    className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors text-white"
                    style={{ background: '#10B981' }}
                  >
                    <CheckCircle2 size={13} /> Concluir
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentStep(prev => prev + 1)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors text-white"
                    style={{ background: '#10B981' }}
                  >
                    Próximo <ChevronRight size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}