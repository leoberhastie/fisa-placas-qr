import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { ServiceType } from '@/types/domain';

export interface ServiceBoxImportRow {
  rowIndex: number;
  numero_caja: string;
  serie_inicial: string;
  serie_final: string;
  cantidad_series: number | null;
  cantidad_placas: number | null;
  errors: string[];
}

export interface ServiceBoxImportResult {
  cajas: number;
  series: number;
  placas: number;
}

export interface ServiceBoxImportProgress {
  batchIndex: number;
  totalBatches: number;
  processedBoxes: number;
  totalBoxes: number;
}

export interface ServiceSummary {
  servicio: string;
  tipo: ServiceType;
  series: number;
  placas: number;
  cajas: number;
}

export interface ColumnMapping {
  numero_caja: number;
  serie_inicial: number;
  serie_final: number;
  cantidad_series: number | null;
  cantidad_placas: number | null;
}

export interface PreviewRow {
  row_index: number;
  numero_caja: string;
  serie_inicial: string;
  serie_final: string;
  consecutivo_inicial: number | null;
  consecutivo_final: number | null;
  series_count: number;
  found_inicial: boolean;
  found_final: boolean;
  error: string | null;
}

export interface PreviewResult {
  rows: PreviewRow[];
  totalSeries: number;
  totalPlates: number;
  errorCount: number;
  duplicateBoxes: boolean;
  overlappingRanges: boolean;
}

type FieldKey = 'numero_caja' | 'serie_inicial' | 'serie_final' | 'cantidad_series' | 'cantidad_placas';

const FIELD_ALIASES: Record<FieldKey, readonly string[]> = {
  numero_caja: ['numero de caja', 'número de caja', 'numero caja', 'número caja', 'caja', 'no caja', 'no. caja'],
  serie_inicial: ['serie inicial', 'serie ini', 'serie de inicio', 'consecutivo inicial', 'inicio', 'desde', 'serie i'],
  serie_final: ['serie final', 'serie fin', 'serie de fin', 'consecutivo final', 'fin', 'hasta', 'serie f'],
  cantidad_series: ['cantidad de series', 'series', 'cantidad series', 'cantidad de juegos', 'juegos'],
  cantidad_placas: ['cantidad de placas', 'placas', 'cantidad placas', 'cantidad de piezas', 'piezas'],
};

function cleanHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumn(headers: string[], aliases: readonly string[]): number {
  return headers.findIndex((header) => aliases.includes(cleanHeader(header)));
}

function autoDetectMapping(headers: string[]): ColumnMapping {
  const numero_caja = findColumn(headers, FIELD_ALIASES.numero_caja);
  const serie_inicial = findColumn(headers, FIELD_ALIASES.serie_inicial);
  const serie_final = findColumn(headers, FIELD_ALIASES.serie_final);
  const seriesCol = findColumn(headers, FIELD_ALIASES.cantidad_series);
  const platesCol = findColumn(headers, FIELD_ALIASES.cantidad_placas);

  return {
    numero_caja,
    serie_inicial,
    serie_final,
    cantidad_series: seriesCol >= 0 ? seriesCol : null,
    cantidad_placas: platesCol >= 0 ? platesCol : null,
  };
}

function parseInteger(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

export function extractHeaders(file: File): Promise<string[]> {
  return readWorkbook(file, (matrix) => {
    const headerRow = matrix[0] ?? [];
    return headerRow.map((cell) => String(cell ?? '').trim());
  });
}

async function readWorkbook<T>(file: File, fn: (matrix: unknown[][]) => T): Promise<T> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo no contiene hojas de cálculo.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  if (matrix.length === 0) throw new Error('La primera hoja está vacía.');
  return fn(matrix);
}

export function getAutoMapping(headers: string[]): ColumnMapping {
  return autoDetectMapping(headers);
}

export function readServiceBoxRows(file: File, mapping: ColumnMapping): Promise<ServiceBoxImportRow[]> {
  return readWorkbook(file, (matrix) => {
    if (mapping.numero_caja < 0 || mapping.serie_inicial < 0 || mapping.serie_final < 0) {
      throw new Error('Faltan columnas obligatorias: número de caja, serie inicial y serie final.');
    }
    const [, ...dataRows] = matrix;
    return dataRows.map((cells, index) => {
      const read = (column: number): string => String(cells[column] ?? '').trim();
      const numero_caja = read(mapping.numero_caja);
      const serie_inicial = read(mapping.serie_inicial).toUpperCase();
      const serie_final = read(mapping.serie_final).toUpperCase();
      const cantidad_series = mapping.cantidad_series !== null ? parseInteger(read(mapping.cantidad_series)) : null;
      const cantidad_placas = mapping.cantidad_placas !== null ? parseInteger(read(mapping.cantidad_placas)) : null;
      const errors: string[] = [];

      if (!numero_caja) errors.push('Número de caja vacío');
      if (!serie_inicial) errors.push('Serie inicial vacía');
      if (!serie_final) errors.push('Serie final vacía');
      if (cantidad_series !== null && cantidad_series <= 0) errors.push('Cantidad de series inválida');
      if (cantidad_placas !== null && cantidad_placas <= 0) errors.push('Cantidad de placas inválida');

      return {
        rowIndex: index + 2,
        numero_caja,
        serie_inicial,
        serie_final,
        cantidad_series,
        cantidad_placas,
        errors,
      };
    });
  });
}

export async function listServiceSummaries(produccionId: string): Promise<ServiceSummary[]> {
  const { data, error } = await supabase.rpc('get_service_summaries', { p_produccion_id: produccionId });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar los servicios de la producción.');

  return data.flatMap((row) =>
    row.tipo_servicio === 'PZ' || row.tipo_servicio === 'JGS'
      ? [{
          servicio: String(row.servicio),
          tipo: row.tipo_servicio,
          series: Number(row.series),
          placas: Number(row.placas),
          cajas: Number(row.cajas),
        }]
      : [],
  );
}

const PREVIEW_CHUNK_SIZE = 500;

async function fetchPreviewChunk(
  produccionId: string,
  servicio: string,
  rows: ServiceBoxImportRow[],
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('preview_box_series_mapping', {
    p_produccion_id: produccionId,
    p_servicio: servicio,
    p_boxes: rows.map((row) => ({
      row_index: row.rowIndex,
      numero_caja: row.numero_caja,
      serie_inicial: row.serie_inicial,
      serie_final: row.serie_final,
    })),
  });

  if (error || !Array.isArray(data)) {
    throw new Error('No se pudo verificar el mapeo de series contra las placas del servicio.');
  }
  return data as Record<string, unknown>[];
}

export async function previewBoxSeriesMapping(
  produccionId: string,
  servicio: string,
  rows: ServiceBoxImportRow[],
): Promise<PreviewResult> {
  const data: Record<string, unknown>[] = [];
  for (let start = 0; start < rows.length; start += PREVIEW_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + PREVIEW_CHUNK_SIZE);
    data.push(...(await fetchPreviewChunk(produccionId, servicio, chunk)));
  }

  const previewRows: PreviewRow[] = data.map((row) => ({
    row_index: Number(row.row_index),
    numero_caja: String(row.numero_caja ?? ''),
    serie_inicial: String(row.serie_inicial ?? ''),
    serie_final: String(row.serie_final ?? ''),
    consecutivo_inicial: row.consecutivo_inicial !== null ? Number(row.consecutivo_inicial) : null,
    consecutivo_final: row.consecutivo_final !== null ? Number(row.consecutivo_final) : null,
    series_count: Number(row.series_count ?? 0),
    found_inicial: Boolean(row.found_inicial),
    found_final: Boolean(row.found_final),
    error: row.error ? String(row.error) : null,
  }));

  const validRows = previewRows.filter((r) => r.error === null);
  const totalSeries = validRows.reduce((sum, r) => sum + r.series_count, 0);
  const errorCount = previewRows.filter((r) => r.error !== null).length;
  const duplicateBoxes = new Set(validRows.map((r) => r.numero_caja)).size !== validRows.length;

  return {
    rows: previewRows,
    totalSeries,
    totalPlates: totalSeries,
    errorCount,
    duplicateBoxes,
    overlappingRanges: hasOverlappingConsecutivoRanges(validRows),
  };
}

function hasOverlappingConsecutivoRanges(rows: PreviewRow[]): boolean {
  const sorted = [...rows].sort((a, b) => (a.consecutivo_inicial ?? 0) - (b.consecutivo_inicial ?? 0));
  let highestFinal = Number.NEGATIVE_INFINITY;
  for (const row of sorted) {
    const inicio = row.consecutivo_inicial ?? 0;
    const fin = row.consecutivo_final ?? 0;
    if (inicio <= highestFinal) return true;
    highestFinal = Math.max(highestFinal, fin);
  }
  return false;
}

const BOX_BATCH_SIZE = 100;

export async function assignServiceBoxes(
  produccionId: string,
  servicio: string,
  tipoServicio: ServiceType,
  rows: ServiceBoxImportRow[],
  fileName: string,
  onProgress?: (progress: ServiceBoxImportProgress) => void,
): Promise<ServiceBoxImportResult> {
  const validRows = rows.filter((row) => row.errors.length === 0);
  const totalBatches = Math.ceil(validRows.length / BOX_BATCH_SIZE);
  let totalSeries = 0;
  let totalPlates = 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const batch = validRows.slice(batchIndex * BOX_BATCH_SIZE, (batchIndex + 1) * BOX_BATCH_SIZE);
    const { data, error } = await supabase.rpc('assign_service_boxes_by_series', {
      p_produccion_id: produccionId,
      p_servicio: servicio,
      p_tipo_servicio: tipoServicio,
      p_boxes: batch.map((row) => ({
        numero_caja: row.numero_caja,
        serie_inicial: row.serie_inicial,
        serie_final: row.serie_final,
        ...(row.cantidad_series === null ? {} : { cantidad_series: row.cantidad_series }),
        ...(row.cantidad_placas === null ? {} : { cantidad_placas: row.cantidad_placas }),
      })),
      p_nombre_archivo: fileName,
    });

    if (error || !data?.[0]) {
      throw new Error(`No se pudo asignar el lote ${batchIndex + 1} de cajas. ${error?.message ?? ''}`.trim());
    }

    const result = data[0] as ServiceBoxImportResult;
    totalSeries += result.series;
    totalPlates += result.placas;
    onProgress?.({
      batchIndex: batchIndex + 1,
      totalBatches,
      processedBoxes: Math.min((batchIndex + 1) * BOX_BATCH_SIZE, validRows.length),
      totalBoxes: validRows.length,
    });
  }

  return { cajas: validRows.length, series: totalSeries, placas: totalPlates };
}
