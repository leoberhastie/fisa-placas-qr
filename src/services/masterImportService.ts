import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { ServiceType } from '@/types/domain';

export interface MasterPlate {
  consecutivo: number;
  serie: string;
}

export interface MasterServiceSheet {
  nombre: string;
  tipo: ServiceType;
  placas: MasterPlate[];
  errors: string[];
}

export interface MasterImportResult {
  servicios: number;
  placas: number;
}

export interface MasterImportProgress {
  serviceIndex: number;
  totalServices: number;
  serviceName: string;
  batchIndex: number;
  totalBatches: number;
  processedSeries: number;
  totalSeries: number;
}

export interface ImportRecord {
  id: string;
  nombre_archivo: string;
  fecha_importacion: string;
  cantidad_registros: number;
  estado_importacion: string;
}

const CONSECUTIVO_ALIASES = ['consecutivo', 'consec', 'no', 'número', 'numero', '#'];
const SERIE_ALIASES = ['serie', 'serial', 'numero de serie', 'número de serie'];

function cleanHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(cleanHeader(header)));
}

function parseConsecutivo(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function defaultServiceType(serviceName: string): ServiceType {
  return /moto|remolque/i.test(serviceName) ? 'PZ' : 'JGS';
}

function parseSheet(name: string, matrix: unknown[][]): MasterServiceSheet {
  const tipo = defaultServiceType(name);
  const withoutHeaders = parseConsecutivo(String(matrix[0]?.[0] ?? '')) !== null;
  const [headerRow = [], ...headedRows] = matrix;
  const headers = withoutHeaders ? [] : headerRow.map((cell) => String(cell ?? '').trim());
  const consecutivoColumn = withoutHeaders ? 0 : findColumn(headers, CONSECUTIVO_ALIASES);
  const serieColumn = withoutHeaders ? 1 : findColumn(headers, SERIE_ALIASES);
  const dataRows = withoutHeaders ? matrix : headedRows;

  if (consecutivoColumn < 0 || serieColumn < 0) {
    return { nombre: name, tipo, placas: [], errors: ['La hoja debe tener columnas de consecutivo y serie.'] };
  }

  const placas: MasterPlate[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const consecutivo = parseConsecutivo(String(cells[consecutivoColumn] ?? ''));
    const serie = String(cells[serieColumn] ?? '').trim().toUpperCase();

    if (consecutivo === null) {
      errors.push(`Fila ${rowNumber}: consecutivo inválido.`);
      return;
    }
    if (!serie) {
      errors.push(`Fila ${rowNumber}: serie vacía.`);
      return;
    }
    if (seen.has(serie)) {
      errors.push(`Fila ${rowNumber}: la serie ${serie} está repetida.`);
      return;
    }
    seen.add(serie);
    placas.push({ consecutivo, serie });
  });

  if (placas.length === 0 && errors.length === 0) {
    errors.push('La hoja no tiene placas.');
  }

  return { nombre: name, tipo, placas, errors };
}

export async function readMasterWorkbook(file: File): Promise<MasterServiceSheet[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  if (workbook.SheetNames.length === 0) throw new Error('El archivo no contiene hojas de cálculo.');

  const serviceSheets = workbook.SheetNames.filter((sheetName) => !/hoja/i.test(sheetName));
  if (serviceSheets.length === 0) throw new Error('El archivo no contiene hojas de servicios.');

  return serviceSheets.map((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
    return parseSheet(sheetName.trim(), matrix);
  });
}

export async function listServiceNames(produccionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('production_services')
    .select('nombre')
    .eq('produccion_id', produccionId);

  if (error || !data) throw new Error('No se pudieron consultar los servicios de la producción.');
  return data.map((row) => row.nombre);
}

const IMPORT_BATCH_SIZE = 5000;

export async function importMasterServices(
  produccionId: string,
  fileName: string,
  sheets: MasterServiceSheet[],
  onProgress?: (progress: MasterImportProgress) => void,
): Promise<MasterImportResult> {
  let totalPlates = 0;
  let importedServices = 0;
  const totalSeries = sheets.reduce((sum, sheet) => sum + sheet.placas.length, 0);
  let processedSeries = 0;

  for (let serviceIndex = 0; serviceIndex < sheets.length; serviceIndex += 1) {
    const sheet = sheets[serviceIndex];
    const seriesPerBatch = sheet.tipo === 'JGS' ? Math.floor(IMPORT_BATCH_SIZE / 2) : IMPORT_BATCH_SIZE;
    const totalBatches = Math.ceil(sheet.placas.length / seriesPerBatch);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
      const batch = sheet.placas.slice(batchIndex * seriesPerBatch, (batchIndex + 1) * seriesPerBatch);
      const { data, error } = await supabase.rpc('import_master_service_batch', {
        p_produccion_id: produccionId,
        p_nombre: sheet.nombre,
        p_tipo: sheet.tipo,
        p_placas: batch,
        p_nombre_archivo: fileName,
        p_first_batch: batchIndex === 0,
        p_last_batch: batchIndex === totalBatches - 1,
        p_total_placas: sheet.placas.length * (sheet.tipo === 'JGS' ? 2 : 1),
      });

      if (error || !data?.[0]) {
        throw new Error(error?.message?.includes('ya existe') || error?.message?.includes('ya existen')
          ? `El servicio ${sheet.nombre} o una de sus series ya existe.`
          : `No se pudo importar el lote ${batchIndex + 1} de ${sheet.nombre}.`);
      }

      processedSeries += batch.length;
      totalPlates += batch.length * (sheet.tipo === 'JGS' ? 2 : 1);
      onProgress?.({
        serviceIndex: serviceIndex + 1,
        totalServices: sheets.length,
        serviceName: sheet.nombre,
        batchIndex: batchIndex + 1,
        totalBatches,
        processedSeries,
        totalSeries,
      });
    }
    importedServices += 1;
  }

  return { servicios: importedServices, placas: totalPlates };
}

export async function listImportRecords(produccionId: string): Promise<ImportRecord[]> {
  const { data, error } = await supabase
    .from('importaciones')
    .select('id, nombre_archivo, fecha_importacion, cantidad_registros, estado_importacion')
    .eq('produccion_id', produccionId)
    .order('fecha_importacion', { ascending: false })
    .limit(10);

  if (error || !data) throw new Error('No se pudo cargar el historial de importaciones.');
  return data as ImportRecord[];
}
