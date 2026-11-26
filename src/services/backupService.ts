import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 5000;

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
  let from = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`No se pudo leer la tabla ${table}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;
    onRows(rows);
    total += rows.length;
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
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
