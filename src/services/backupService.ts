import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 500;
const MAX_RETRIES = 3;

export const BACKUP_TABLES = [
  'productions',
  'production_services',
  'service_boxes',
  'placas',
  'reoperaciones',
  'recuperaciones',
  'reoperaciones_anuladas',
  'placa_completados',
  'box_completion',
  'historial_operaciones',
  'importaciones',
  'reinicios_produccion',
  'auditoria_comparaciones',
  'profiles',
] as const;

export interface BackupProgress {
  table: string;
  tableIndex: number;
  tableTotal: number;
  rowsInTable: number;
  overallPercent: number;
}

export interface BackupResult {
  fileName: string;
  totalRows: number;
  tableCounts: Record<string, number>;
  sizeBytes: number;
}

async function fetchTableAll(
  table: string,
  onRows: (rows: Record<string, unknown>[]) => void,
): Promise<number> {
  let total = 0;
  let lastId: unknown = null;
  for (;;) {
    let rows: Record<string, unknown>[] | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let query = supabase
        .from(table)
        .select('*')
        .order('id', { ascending: true })
        .limit(PAGE_SIZE);
      if (lastId !== null) {
        query = query.gt('id', lastId as never);
      }
      const { data, error } = await query;
      const timedOut = error && /statement timeout|57014/i.test(error.message);
      if (!error) {
        rows = data as Record<string, unknown>[];
        break;
      }
      if (!timedOut || attempt === MAX_RETRIES) {
        throw new Error(`No se pudo leer la tabla ${table}: ${error.message}`);
      }
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
    if (!rows || rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    onRows(rows);
    total += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }
  return total;
}

export async function createDatabaseBackup(
  usuario: string,
  onProgress: (progress: BackupProgress) => void,
  shouldCancel: () => boolean,
): Promise<BackupResult> {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stampStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const fileName = `respaldo-fisa-placas-${stampStr}.json`;

  const parts: string[] = [];
  const tableCounts: Record<string, number> = {};
  let totalRows = 0;

  parts.push(
    JSON.stringify({
      app: 'FISA-PLACAS Reoperaciones',
      tipo: 'respaldo-base-de-datos',
      generado_por: usuario,
      generado_en: d.toISOString(),
      tablas: BACKUP_TABLES,
    }) + '\n\n',
  );

  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    if (shouldCancel()) throw new Error('Respaldo cancelado.');
    const table = BACKUP_TABLES[i];
    onProgress({ table, tableIndex: i, tableTotal: BACKUP_TABLES.length, rowsInTable: 0, overallPercent: (i / BACKUP_TABLES.length) * 100 });

    let chunkStart = true;
    const count = await fetchTableAll(table, (rows) => {
      const serialized = rows.map((r) => JSON.stringify(r)).join('\n');
      parts.push((chunkStart ? '' : '\n') + serialized);
      chunkStart = false;
    });
    tableCounts[table] = count;
    totalRows += count;

    onProgress({
      table,
      tableIndex: i,
      tableTotal: BACKUP_TABLES.length,
      rowsInTable: count,
      overallPercent: ((i + 1) / BACKUP_TABLES.length) * 100,
    });
  }

  const blobParts = [
    parts[0],
    ...BACKUP_TABLES.map((t, i) => {
      const body = parts[i + 1] ?? '';
      return `=== TABLA: ${t} (${tableCounts[t] ?? 0} registros) ===\n${body}\n\n`;
    }),
  ];
  const blob = new Blob(blobParts, { type: 'application/json' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { fileName, totalRows, tableCounts, sizeBytes: blob.size };
}
