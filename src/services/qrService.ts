import type { PlatePosition } from '@/types/domain';

export interface ParsedQrData {
  serie: string;
  posicion: string;
  posicionNormalizada: PlatePosition | null;
  complementaria: string;
  raw: string;
}

const POSITION_NORMALIZE: Record<string, PlatePosition> = {
  delantera: 'FRONTAL',
  frontal: 'FRONTAL',
  frente: 'FRONTAL',
  front: 'FRONTAL',
  d: 'FRONTAL',
  del: 'FRONTAL',
  trasera: 'TRASERA',
  posterior: 'TRASERA',
  atras: 'TRASERA',
  back: 'TRASERA',
  t: 'TRASERA',
  tras: 'TRASERA',
};

const ASTERISK_PLACA_PATTERN = /^PLACA\s+(.+)$/i;
const SERIE_LABEL_PATTERN = /^SERIE:\s*(.+)$/i;

function normalizePosition(raw: string): PlatePosition | null {
  const clean = raw.trim().toLowerCase();
  return POSITION_NORMALIZE[clean] ?? null;
}

function buildParsed(text: string, serie: string, posicion: string): ParsedQrData {
  return {
    serie,
    posicion,
    posicionNormalizada: normalizePosition(posicion),
    complementaria: text,
    raw: text,
  };
}

/**
 * Format: "GUL-550-G * GUANAJUATO * ... * PLACA TRASERA * 00048 * ..."
 * The serie is the first segment and the position is the segment starting with "PLACA".
 */
function parseAsteriskFormat(text: string): { serie: string; posicion: string } | null {
  if (!text.includes('*')) return null;
  const segments = text
    .split('*')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  const serie = (segments[0].match(SERIE_LABEL_PATTERN)?.[1] ?? segments[0]).trim();
  const posicion = segments
    .map((segment) => segment.match(ASTERISK_PLACA_PATTERN)?.[1])
    .find((value): value is string => value !== undefined)
    ?.trim();
  if (!serie || !posicion) return null;
  return { serie, posicion };
}

/**
 * Parses QR content like:
 * "SERIE: 72SHE1, GOB DE NUEVO LEON, FAB: FORMAS INTELIGENTES S.A. DE C.V., REG: SICT/FPyC/16/034, PLACA TRASERA, LOTE:00033, SERV: TRANSPORTE PRIVADO MOTOCICLETA, VIG: 2027, FAB:2024"
 * or the asterisk-separated format described in parseAsteriskFormat.
 */
export function parseQrContent(raw: string): ParsedQrData {
  const text = raw.trim();

  const asterisk = parseAsteriskFormat(text);
  if (asterisk) return buildParsed(text, asterisk.serie, asterisk.posicion);

  let serie = '';
  const serieMatch = text.match(/SERIE:\s*([^,]+)/i);
  if (serieMatch) {
    serie = serieMatch[1].trim();
  }

  let posicion = '';
  const placaMatch = text.match(/PLACA\s+(DELANTERA|TRASERA|FRONTAL|POSTERIOR|FRENTE|ATRAS|FRONT|BACK)/i);
  if (placaMatch) {
    posicion = placaMatch[1].trim();
  }
  if (!posicion) {
    const posMatch = text.match(/POSICION:\s*([^,]+)/i);
    if (posMatch) {
      posicion = posMatch[1].trim();
    }
  }

  return buildParsed(text, serie, posicion);
}

/**
 * Tries to find a placa by produccion_id + serie + posicion.
 * Returns the placa if found, null otherwise.
 * The service and caja come from the database, not the QR.
 */
export async function findPlacaByQr(
  produccionId: string,
  parsed: ParsedQrData,
  findFn: (produccionId: string, serie: string, posicion: PlatePosition) => Promise<{ id: string; produccion_id: string; consecutivo: number; serie: string; posicion: string; servicio: string; numero_caja: string; fecha_importacion: string; activo: boolean } | null>,
) {
  if (!parsed.serie || !parsed.posicionNormalizada) {
    return null;
  }
  return findFn(produccionId, parsed.serie, parsed.posicionNormalizada);
}
