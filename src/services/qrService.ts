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

function normalizePosition(raw: string): PlatePosition | null {
  const clean = raw.trim().toLowerCase();
  return POSITION_NORMALIZE[clean] ?? null;
}

/**
 * Parses QR content like:
 * "SERIE: 72SHE1, GOB DE NUEVO LEON, FAB: FORMAS INTELIGENTES S.A. DE C.V., REG: SICT/FPyC/16/034, PLACA TRASERA, LOTE:00033, SERV: TRANSPORTE PRIVADO MOTOCICLETA, VIG: 2027, FAB:2024"
 *
 * Extracts:
 * - Serie (from "SERIE:" label)
 * - Posicion (from "PLACA DELANTERA" / "PLACA TRASERA" pattern or explicit "POSICION:")
 * - Complementaria (the full raw string minus the serie)
 */
export function parseQrContent(raw: string): ParsedQrData {
  const text = raw.trim();

  // Extract serie: look for "SERIE:" followed by value until next comma or "PLACA"
  let serie = '';
  const serieMatch = text.match(/SERIE:\s*([^,]+)/i);
  if (serieMatch) {
    serie = serieMatch[1].trim();
  }

  // Extract posicion: look for "PLACA DELANTERA" / "PLACA TRASERA" or "POSICION: DELANTERA"
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

  // Build complementaria: the full string for reference
  const complementaria = text;

  return {
    serie,
    posicion,
    posicionNormalizada: normalizePosition(posicion),
    complementaria,
    raw: text,
  };
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
