import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable, { applyPlugin } from 'jspdf-autotable';

applyPlugin(jsPDF);

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

export interface ExportKpi {
  label: string;
  value: string | number;
}

export interface ExportChart {
  title: string;
  items: { label: string; value: number }[];
}

export interface ExportMeta {
  title: string;
  fileBase: string;
  produccion: string;
  usuario: string;
  filtros: string[];
  kpis?: ExportKpi[];
  charts?: ExportChart[];
}

const APP_NAME = 'FISA-PLACAS Reoperaciones';

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function formatGeneratedAt(): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
}

export function exportExcel<T>(meta: ExportMeta, columns: ExportColumn<T>[], rows: T[]): void {
  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    [APP_NAME],
    [meta.title],
    ['Producción', meta.produccion],
    ['Fecha de generación', formatGeneratedAt()],
    ['Usuario', meta.usuario],
    [],
    ['Filtros aplicados'],
    ...(meta.filtros.length > 0 ? meta.filtros.map((f) => [f]) : [['Sin filtros']]),
  ];
  if (meta.kpis && meta.kpis.length > 0) {
    summary.push([], ['Indicador', 'Valor'], ...meta.kpis.map((k) => [k.label, k.value]));
  }
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet['!cols'] = [{ wch: 42 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen');

  const header = columns.map((c) => c.header);
  const body = rows.map((row) => columns.map((c) => c.value(row)));
  const dataSheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  dataSheet['!cols'] = columns.map((c, i) => {
    const longest = Math.max(c.header.length, ...body.map((r) => String(r[i] ?? '').length));
    return { wch: Math.min(Math.max(longest + 2, 10), 60) };
  });
  dataSheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: columns.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Datos');

  XLSX.writeFile(wb, `${meta.fileBase}-${stamp()}.xlsx`);
}

export function exportPdf<T>(meta: ExportMeta, columns: ExportColumn<T>[], rows: T[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(meta.title, margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  [
    `${APP_NAME}  ·  Producción: ${meta.produccion}`,
    `Fecha de generación: ${formatGeneratedAt()}  ·  Usuario: ${meta.usuario}`,
    `Filtros: ${meta.filtros.length > 0 ? meta.filtros.join('; ') : 'sin filtros'}`,
  ].forEach((line) => {
    doc.text(line, margin, y);
    y += 5;
  });
  y += 3;

  if (meta.kpis && meta.kpis.length > 0) {
    const gap = 4;
    const perRow = Math.min(meta.kpis.length, 5);
    const boxWidth = (pageWidth - margin * 2 - gap * (perRow - 1)) / perRow;
    meta.kpis.forEach((kpi, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = margin + col * (boxWidth + gap);
      const boxY = y + row * 20;
      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, boxY, boxWidth, 16, 2, 2, 'FD');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, x + 3, boxY + 5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(String(kpi.value), x + 3, boxY + 12.5);
      doc.setFont('helvetica', 'normal');
    });
    y += Math.ceil(meta.kpis.length / perRow) * 20 + 4;
  }

  (meta.charts ?? []).forEach((chart) => {
    const maxValue = Math.max(1, ...chart.items.map((i) => i.value));
    if (y > 170) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(chart.title, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    chart.items.slice(0, 10).forEach((item) => {
      doc.setTextColor(51, 65, 85);
      doc.text(item.label, margin, y + 3.5, { maxWidth: 55 });
      doc.setFillColor(14, 116, 144);
      const barWidth = (item.value / maxValue) * 120;
      doc.rect(margin + 60, y, Math.max(barWidth, 0.5), 4.5, 'F');
      doc.text(String(item.value), margin + 62 + barWidth, y + 3.5);
      y += 6;
    });
    y += 4;
  });

  const pdfDoc = doc as jsPDF & { autoTable: (options: Parameters<typeof autoTable>[1]) => void };
  pdfDoc.autoTable({
    startY: y,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(c.value(row)))),
    margin: { left: margin, right: margin, bottom: 14 },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(APP_NAME, margin, pageHeight - 6);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  }

  doc.save(`${meta.fileBase}-${stamp()}.pdf`);
}
