import { supabase } from '@/lib/supabase';
import { BACKUP_TABLES } from '@/services/sqlBackupService';

/**
 * Restauración de respaldos SQL generados por sqlBackupService.
 *
 * Los archivos tienen este formato:
 *   -- Tabla: placas · Parte 1 de 3
 *   ...esquema (se ignora al restaurar en Supabase)...
 *   INSERT INTO placas ("id", "produccion_id", ...) VALUES (...), (...);
 *
 * La restauración se hace por lotes vía REST (upsert por id), lo que respeta
 * RLS y evita duplicados si el mismo archivo se sube dos veces.
 */

const BATCH_SIZE = 300;
const MAX_RETRIES = 3;

export interface ParsedSqlFile {
  tabla: string;
  parte: number;
  dePartes: number;
  rows: Record<string, unknown>[];
}

export interface SqlRestoreProgress {
  fileName: string;
  fileIndex: number;
  fileTotal: number;
  rowsInFile: number;
  rowsRestored: number;
  overallPercent: number;
}

export interface SqlRestoreResult {
  totalRows: number;
  perTable: Record<string, number>;
}

export class SqlRestoreError extends Error {
  constructor(
    message: string,
    public readonly fileName?: string,
  ) {
    super(message);
  }
}

function parseValues(raw: string): unknown[] {
  const out: unknown[] = [];
  let i = 0;
  const n = raw.length;
  while (i < n) {
    while (i < n && /\s/.test(raw[i])) i++;
    if (i >= n) break;
    const c = raw[i];
    if (c === "'" ) {
      let s = '';
      i++;
      for (;;) {
        if (i >= n) throw new Error('Cadena sin cerrar en el archivo SQL.');
        if (raw[i] === "'") {
          if (raw[i + 1] === "'") { s += "'"; i += 2; continue; }
          i++;
          break;
        }
        s += raw[i++];
      }
      out.push(s);
      continue;
    }
    if (raw.startsWith('true', i)) { out.push(true); i += 4; continue; }
    if (raw.startsWith('false', i)) { out.push(false); i += 5; continue; }
    if (raw.startsWith('NULL', i)) { out.push(null); i += 4; continue; }
    // jsonb: '... '::jsonb ya se consumió como string; aquí solo quedan números y uuids sin comillas
    let j = i;
    while (j < n && raw[j] !== ',' && raw[j] !== ')' && !/\s/.test(raw[j])) j++;
    const tok = raw.slice(i, j);
    if (tok === '') throw new Error('Valor vacío inesperado en el archivo SQL.');
    const num = Number(tok);
    out.push(tok !== '' && !Number.isNaN(num) ? num : tok);
    i = j;
    if (raw[i] === ',') i++;
  }
  return out;
}

export function parseSqlBackup(content: string, fallbackName = 'archivo.sql'): ParsedSqlFile {
  const tableMatch = content.match(/--\s*Tabla:\s*(\S+)\s*·\s*Parte\s*(\d+)\s*de\s*(\d+)/);
  if (!tableMatch) {
    throw new SqlRestoreError(
      'El archivo no tiene el formato de respaldo de FISA-PLACAS (falta la cabecera "-- Tabla: ...").',
      fallbackName,
    );
  }
  const tabla = tableMatch[1];
  if (!BACKUP_TABLES.includes(tabla)) {
    throw new SqlRestoreError(`Tabla desconocida en el archivo: ${tabla}.`, fallbackName);
  }
  const parte = Number(tableMatch[2]);
  const dePartes = Number(tableMatch[3]);

  const insertMatch = content.match(/INSERT INTO (\S+) \(([^)]+)\) VALUES\n([\s\S]*?);\s*$/);
  if (!insertMatch) {
    throw new SqlRestoreError('No se encontró la instrucción INSERT en el archivo.', fallbackName);
  }
  const cols = insertMatch[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, unknown>[] = [];
  const valuesBlock = insertMatch[3];
  // Separar tuplas de nivel superior: "(...),(...)" — hay que respetar comillas.
  const tuples: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (let i = 0; i < valuesBlock.length; i++) {
    const ch = valuesBlock[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (valuesBlock[i + 1] === "'") { cur += "'"; i++; }
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === '(') { depth++; if (depth === 1) { cur = ''; continue; } }
    if (ch === ')') { depth--; if (depth === 0) { tuples.push(cur); continue; } }
    if (depth > 0) cur += ch;
  }
  for (const t of tuples) {
    const vals = parseValues(t);
    if (vals.length !== cols.length) {
      throw new SqlRestoreError('Un registro del archivo tiene columnas inconsistentes.', fallbackName);
    }
    const row: Record<string, unknown> = {};
    cols.forEach((c, idx) => { row[c] = vals[idx]; });
    rows.push(row);
  }
  return { tabla, parte, dePartes, rows };
}

async function upsertBatch(
  table: string,
  batch: Record<string, unknown>[],
  fileName: string,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id', ignoreDuplicates: false });
    if (!error) return;
    const retriable = /timeout|57014|network|fetch/i.test(error.message);
    if (!retriable || attempt === MAX_RETRIES) {
      throw new SqlRestoreError(`Error al restaurar en ${table}: ${error.message}`, fileName);
    }
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
}

export interface RestoreSqlBackupArgs {
  files: { name: string; content: string }[];
  onProgress: (p: SqlRestoreProgress) => void;
}

export async function restoreSqlBackup({
  files,
  onProgress,
}: RestoreSqlBackupArgs): Promise<SqlRestoreResult> {
  const perTable: Record<string, number> = {};
  let totalRows = 0;

  for (let f = 0; f < files.length; f++) {
    const { name, content } = files[f];
    const parsed = parseSqlBackup(content, name);
    let restoredInFile = 0;
    for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
      const batch = parsed.rows.slice(i, i + BATCH_SIZE);
      await upsertBatch(parsed.tabla, batch, name);
      restoredInFile += batch.length;
      perTable[parsed.tabla] = (perTable[parsed.tabla] ?? 0) + batch.length;
      totalRows += batch.length;
      onProgress({
        fileName: name,
        fileIndex: f,
        fileTotal: files.length,
        rowsInFile: parsed.rows.length,
        rowsRestored: restoredInFile,
        overallPercent: ((f + restoredInFile / Math.max(parsed.rows.length, 1)) / files.length) * 100,
      });
    }
  }
  return { totalRows, perTable };
}
