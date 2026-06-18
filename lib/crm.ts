// ─── Constantes do CRM — compartilhadas entre API e frontend ─────────────────
// Este arquivo é importado tanto por app/api/crm/route.ts quanto pelos
// componentes do dashboard. Nunca importar direto de api/route em componentes.

export const ETAPAS_FUNIL: Record<string, string[]> = {
    vendas:       ['novo_contato', 'interesse_identificado', 'proposta_enviada', 'em_negociacao', 'fechado', 'perdido'],
    suporte:      ['aberto', 'em_analise', 'aguardando_cliente', 'em_resolucao', 'resolvido', 'encerrado'],
    agendamentos: ['novo_contato', 'interesse_identificado', 'agendado', 'confirmado', 'concluido', 'cancelado'],
    qualificacao: ['novo_lead', 'contato_realizado', 'qualificado', 'oportunidade', 'convertido', 'descartado'],
  }
  
  export const ETAPA_INICIAL: Record<string, string> = {
    vendas:       'novo_contato',
    suporte:      'aberto',
    agendamentos: 'novo_contato',
    qualificacao: 'novo_lead',
  }
  
  export const LABELS_ETAPA: Record<string, Record<string, string>> = {
    vendas: {
      novo_contato:           'Novo Contato',
      interesse_identificado: 'Interesse Identificado',
      proposta_enviada:       'Proposta Enviada',
      em_negociacao:          'Em Negociação',
      fechado:                'Fechado',
      perdido:                'Perdido',
    },
    suporte: {
      aberto:             'Aberto',
      em_analise:         'Em Análise',
      aguardando_cliente: 'Aguardando Cliente',
      em_resolucao:       'Em Resolução',
      resolvido:          'Resolvido',
      encerrado:          'Encerrado',
    },
    agendamentos: {
      novo_contato:           'Novo Contato',
      interesse_identificado: 'Interesse Identificado',
      agendado:               'Agendado',
      confirmado:             'Confirmado',
      concluido:              'Concluído',
      cancelado:              'Cancelado',
    },
    qualificacao: {
      novo_lead:         'Novo Lead',
      contato_realizado: 'Contato Realizado',
      qualificado:       'Qualificado',
      oportunidade:      'Oportunidade',
      convertido:        'Convertido',
      descartado:        'Descartado',
    },
  }
  
  export const LABELS_FUNIL: Record<string, string> = {
    vendas:       'Vendas',
    suporte:      'Suporte',
    agendamentos: 'Agendamentos',
    qualificacao: 'Qualif. de Lead',
  }
  
  export const ETAPAS_FINAIS: Record<string, string[]> = {
    vendas:       ['fechado', 'perdido'],
    suporte:      ['resolvido', 'encerrado'],
    agendamentos: ['concluido', 'cancelado'],
    qualificacao: ['convertido', 'descartado'],
  }