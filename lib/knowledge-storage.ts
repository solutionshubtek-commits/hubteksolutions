/**
 * Nomes de arquivo na base de conhecimento.
 *
 * O Storage do Supabase recusa chaves de objeto com caracteres nao-ASCII,
 * devolvendo `InvalidKey` (HTTP 400). Isso derrubava o upload inteiro de
 * arquivos como "Renovar - Catalogo de Produtos.docx" (com acento) — e a rota
 * traduzia a falha para o generico "Erro no upload do arquivo".
 *
 * Espacos, parenteses, &, virgulas e hifens sao aceitos pelo Storage; apenas
 * o que esta fora do ASCII precisa sair. O nome original continua gravado em
 * knowledge_base.nome_arquivo — a sanitizacao vale so para o caminho fisico.
 */
export function sanitizarNomeArquivo(nome: string): string {
  // NFD decompoe "á" em "a" + acento combinante; o acento cai no filtro ASCII
  // e sobra a letra base.
  const limpo = nome.normalize('NFD').replace(/[^\x00-\x7F]/g, '').trim()
  return limpo || 'arquivo'
}

/**
 * Sufixo aplicado quando um documento e dividido em varios trechos:
 * "contrato.docx [parte 2/5]". O arquivo no Storage e unico e usa o nome
 * original, entao o sufixo precisa sair antes de qualquer comparacao.
 */
export function nomeBaseDoDocumento(nomeArquivo: string): string {
  return nomeArquivo.replace(/\s*\[parte \d+\/\d+\]\s*$/, '')
}

/**
 * Localiza, numa listagem do Storage, o objeto correspondente a um registro da
 * knowledge_base. Os objetos sao gravados como `<timestamp>_<nome sanitizado>`.
 */
export function encontrarObjetoDoDocumento(
  objetos: { name: string }[],
  nomeArquivo: string
): string | null {
  const alvo = sanitizarNomeArquivo(nomeBaseDoDocumento(nomeArquivo))
  return objetos.find(o => o.name.endsWith(`_${alvo}`))?.name ?? null
}
