import jsPDF from 'jspdf'

export interface PDFRow {
  [key: string]: string | number
}

export function exportPDF({
  titulo,
  subtitulo,
  colunas,
  linhas,
  totais,
  nomeArquivo,
}: {
  titulo: string
  subtitulo?: string
  colunas: { label: string; key: string; align?: 'left' | 'right' }[]
  linhas: PDFRow[]
  totais?: PDFRow
  nomeArquivo: string
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const W = doc.internal.pageSize.getWidth()
  const margin = 14
  const verde = [16, 185, 129] as const
  const cinzaEscuro = [30, 41, 59] as const
  const cinzaMedio = [71, 85, 105] as const
  const branco = [255, 255, 255] as const

  // Fundo header
  doc.setFillColor(...cinzaEscuro)
  doc.rect(0, 0, W, 28, 'F')

  // Título
  doc.setTextColor(...verde)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('HUBTEK SOLUTIONS', margin, 11)

  doc.setTextColor(...branco)
  doc.setFontSize(11)
  doc.text(titulo, margin, 20)

  // Subtítulo e data
  doc.setTextColor(...cinzaMedio)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  if (subtitulo) doc.text(subtitulo, margin, 26)
  const dataGeracao = `Gerado em: ${new Date().toLocaleString('pt-BR')}`
  doc.text(dataGeracao, W - margin, 26, { align: 'right' })

  // Tabela
  let y = 36
  const colW = (W - margin * 2) / colunas.length

  // Header tabela
  doc.setFillColor(...verde)
  doc.rect(margin, y, W - margin * 2, 8, 'F')
  doc.setTextColor(...branco)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  colunas.forEach((col, i) => {
    const x = margin + i * colW
    doc.text(col.label.toUpperCase(), col.align === 'right' ? x + colW - 2 : x + 2, y + 5.5, {
      align: col.align === 'right' ? 'right' : 'left',
    })
  })

  y += 8

  // Linhas
  linhas.forEach((linha, rowIdx) => {
    if (y > 185) {
      doc.addPage()
      y = 14
    }

    const bg = rowIdx % 2 === 0 ? [248, 250, 252] : [241, 245, 249]
    doc.setFillColor(...(bg as [number, number, number]))
    doc.rect(margin, y, W - margin * 2, 7, 'F')

    doc.setTextColor(...cinzaEscuro)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')

    colunas.forEach((col, i) => {
      const x = margin + i * colW
      const val = String(linha[col.key] ?? '—')
      doc.text(val, col.align === 'right' ? x + colW - 2 : x + 2, y + 4.8, {
        align: col.align === 'right' ? 'right' : 'left',
      })
    })

    y += 7
  })

  // Totais
  if (totais) {
    doc.setFillColor(...cinzaEscuro)
    doc.rect(margin, y, W - margin * 2, 8, 'F')
    doc.setTextColor(...branco)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    colunas.forEach((col, i) => {
      const x = margin + i * colW
      const val = String(totais[col.key] ?? '')
      if (val) {
        doc.text(val, col.align === 'right' ? x + colW - 2 : x + 2, y + 5.5, {
          align: col.align === 'right' ? 'right' : 'left',
        })
      }
    })
    y += 8
  }

  // Rodapé
  doc.setTextColor(...cinzaMedio)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('Hubtek Solutions · app.hubteksolutions.tech', W / 2, 205, { align: 'center' })

  doc.save(`${nomeArquivo}.pdf`)
}
