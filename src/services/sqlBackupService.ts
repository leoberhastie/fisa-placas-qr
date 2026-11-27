import { supabase } from '@/lib/supabase';

/**
 * Respaldo SQL por rango de fechas, dividido en archivos de max 1000 registros por tabla.
 *
 * Cada archivo contiene:
 *  - Comentario-cabecera con metadatos (tabla, parte i/N, rango de fechas, generador).
 *  - El esquema de las 14 tablas (CREATE TABLE IF NOT EXISTS) para restaurar en un sistema local.
 *  - INSERTs (max 1000) de UNA sola tabla por archivo, ordenados por id.
 *
 * Cada archivo puede recargarse en Supabase desde la sección "Restaurar respaldo"
 * (upsert por id) o ejecutarse con psql en un PostgreSQL local.
 */

const PAGE_SIZE = 500;
export const ROWS_PER_FILE = 1000;
const MAX_RETRIES = 3;

export interface SqlBackupOptions {
  desde: string; // 'YYYY-MM-DD' inclusive
  hasta: string; // 'YYYY-MM-DD' inclusive
  usuario: string;
}

export interface SqlBackupFile {
  fileName: string;
  sql: string;
  tabla: string;
  parte: number;
  dePartes: number;
  rowCount: number;
}

export interface SqlBackupResult {
  files: SqlBackupFile[];
  totalRows: number;
  tablaCounts: Record<string, number>;
}

/** Columna de fecha que define a qué día "pertenece" cada registro, por tabla. */
export const TABLE_DATE_COLUMNS: Record<string, string> = {
  productions: 'created_at',
  production_services: 'created_at',
  service_boxes: 'created_at',
  placas: 'created_at',
  reoperaciones: 'fecha_hora',
  recuperaciones: 'fecha_hora',
  reoperaciones_anuladas: 'fecha_hora',
  placa_completados: 'fecha_completado',
  box_completion: 'completada_at',
  historial_operaciones: 'fecha_hora',
  importaciones: 'fecha_importacion',
  reinicios_produccion: 'iniciado_at',
  auditoria_comparaciones: 'fecha',
  profiles: 'created_at',
};

export const BACKUP_TABLES = Object.keys(TABLE_DATE_COLUMNS);

export interface SqlBackupProgress {
  table: string;
  tableIndex: number;
  tableTotal: number;
  rowsInTable: number;
  overallPercent: number;
  filesCompleted: number;
}

/* ------------------------------------------------------------------ */
/* Esquema SQL embebido en cada archivo (para sistema local con psql)  */
/* ------------------------------------------------------------------ */

const SCHEMA_SQL = `-- Esquema de tablas (PostgreSQL). Ignora errores si las tablas ya existen.
CREATE TABLE IF NOT EXISTS productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'activa',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  consecutivo integer NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT '',
  anio integer NOT NULL DEFAULT 0,
  fecha_ultima_importacion timestamptz,
  version_datos integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS production_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo_servicio text NOT NULL DEFAULT 'JGS',
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  servicio text NOT NULL,
  numero_caja text NOT NULL,
  tipo_servicio text NOT NULL,
  consecutivo_inicial integer NOT NULL,
  consecutivo_final integer NOT NULL,
  cantidad_series integer NOT NULL,
  cantidad_placas integer NOT NULL,
  nombre_archivo text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  serie_inicial text,
  serie_final text,
  parcialidad integer NOT NULL DEFAULT 0,
  es_parcial boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS placas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  consecutivo integer NOT NULL DEFAULT 0,
  serie text NOT NULL,
  posicion text NOT NULL,
  servicio text NOT NULL DEFAULT '',
  numero_caja text NOT NULL DEFAULT '',
  fecha_importacion timestamptz NOT NULL DEFAULT now(),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reoperaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid REFERENCES placas(id),
  proceso text NOT NULL DEFAULT '',
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'pendiente',
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recuperaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid REFERENCES placas(id),
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  tipo_recuperacion text NOT NULL DEFAULT '',
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  es_manual boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS reoperaciones_anuladas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reoperacion_id uuid NOT NULL,
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid REFERENCES placas(id),
  proceso text NOT NULL DEFAULT '',
  fecha_hora timestamptz NOT NULL,
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT '',
  observaciones text NOT NULL DEFAULT '',
  motivo_anulacion text NOT NULL,
  anulada_por text NOT NULL DEFAULT '',
  anulada_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS placa_completados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid NOT NULL REFERENCES placas(id),
  fecha_completado timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  servicio text NOT NULL DEFAULT '',
  numero_caja text NOT NULL DEFAULT '',
  serie text NOT NULL DEFAULT '',
  posicion text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS box_completion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  servicio text NOT NULL,
  numero_caja text NOT NULL,
  completada_manual boolean NOT NULL DEFAULT false,
  completada_at timestamptz,
  completada_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  placas_no_completadas integer NOT NULL DEFAULT 0,
  detalle_no_completadas jsonb
);
CREATE TABLE IF NOT EXISTS historial_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid REFERENCES placas(id),
  tipo_operacion text NOT NULL DEFAULT '',
  proceso text NOT NULL DEFAULT '',
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  estado_anterior text NOT NULL DEFAULT '',
  estado_nuevo text NOT NULL DEFAULT '',
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS importaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  nombre_archivo text NOT NULL DEFAULT '',
  fecha_importacion timestamptz NOT NULL DEFAULT now(),
  usuario text NOT NULL DEFAULT '',
  cantidad_registros integer NOT NULL DEFAULT 0,
  cantidad_nuevos integer NOT NULL DEFAULT 0,
  cantidad_actualizados integer NOT NULL DEFAULT 0,
  cantidad_errores integer NOT NULL DEFAULT 0,
  estado_importacion text NOT NULL DEFAULT 'pendiente',
  version_datos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reinicios_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  modo text NOT NULL,
  estado text NOT NULL DEFAULT 'en_curso',
  usuario_id uuid,
  usuario_email text NOT NULL DEFAULT '',
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  completado_at timestamptz
);
CREATE TABLE IF NOT EXISTS auditoria_comparaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  usuario text NOT NULL DEFAULT '',
  fecha timestamptz NOT NULL DEFAULT now(),
  nombre_archivo text NOT NULL DEFAULT '',
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  detalles jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'operador',
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

/* ------------------------------------------------------------------ */
/* Lectura por cursor (evita timeout en tablas grandes)                */
/* ------------------------------------------------------------------ */

async function fetchTableBetween(
  table: string,
  dateColumn: string,
  desde: string,
  hasta: string,
  onRows: (rows: Record<string, unknown>[]) => void,
  shouldCancel: () => boolean,
): Promise<number> {
  let total = 0;
  let lastId: string | null = null;
  for (;;) {
    if (shouldCancel()) throw new Error('Respaldo cancelado.');
    let rows: Record<string, unknown>[] | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let q = supabase
        .from(table)
        .select('*')
        .gte(dateColumn, `${desde}T00:00:00Z`)
        .lte(dateColumn, `${hasta}T23:59:59Z`)
        .order('id', { ascending: true })
        .limit(PAGE_SIZE);
      if (lastId !== null) q = q.gt('id', lastId);
      const { data, error } = await q;
      const timedOut = error && /statement timeout|57014/i.test(error.message);
      if (!error) {
        rows = (data ?? []) as Record<string, unknown>[];
        break;
      }
      if (!timedOut || attempt === MAX_RETRIES) {
        throw new Error(`No se pudo leer la tabla ${table}: ${error.message}`);
      }
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
    if (!rows || rows.length === 0) break;
    lastId = String(rows[rows.length - 1].id);
    onRows(rows);
    total += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Serialización SQL                                                   */
/* ------------------------------------------------------------------ */

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildInsert(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const values = rows
    .map((r) => `(${cols.map((c) => sqlLiteral(r[c])).join(', ')})`)
    .join(',\n  ');
  return `INSERT INTO ${table} (${colList}) VALUES\n  ${values}\nON CONFLICT (id) DO NOTHING;\n`;
}

/* ------------------------------------------------------------------ */
/* Generación principal                                                */
/* ------------------------------------------------------------------ */

function fileStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(2)}`;
  const tt = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${dd}_${tt}`;
}

function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadSqlFile(fileName: string, content: string): void {
  downloadTextFile(fileName, content);
}

export interface GenerateSqlBackupArgs {
  options: SqlBackupOptions;
  onProgress: (p: SqlBackupProgress) => void;
  shouldCancel: () => boolean;
}

export async function generateSqlBackup({
  options,
  onProgress,
  shouldCancel,
}: GenerateSqlBackupArgs): Promise<SqlBackupResult> {
  const { desde, hasta, usuario } = options;
  const tables = BACKUP_TABLES;
  const stamp = fileStamp(new Date());
  const files: SqlBackupFile[] = [];
  const tablaCounts: Record<string, number> = {};
  let totalRows = 0;

  for (let i = 0; i < tables.length; i++) {
    if (shouldCancel()) throw new Error('Respaldo cancelado.');
    const table = tables[i];
    const dateColumn = TABLE_DATE_COLUMNS[table];
    onProgress({ table, tableIndex: i, tableTotal: tables.length, rowsInTable: 0, overallPercent: (i / tables.length) * 100, filesCompleted: files.length });

    // 1) Recolectar todas las filas del rango en memoria.
    const allRows: Record<string, unknown>[] = [];
    const count = await fetchTableBetween(table, dateColumn, desde, hasta, (rows) => {
      allRows.push(...rows);
    }, shouldCancel);
    tablaCounts[table] = count;
    totalRows += count;

    if (count === 0) continue;

    // 2) Dividir en bloques de ROWS_PER_FILE y crear un archivo por bloque.
    const dePartes = Math.ceil(count / ROWS_PER_FILE);
    for (let parte = 1; parte <= dePartes; parte++) {
      const chunk = allRows.slice((parte - 1) * ROWS_PER_FILE, parte * ROWS_PER_FILE);
      const header =
        `-- Respaldo FISA-PLACAS (SQL)\n` +
        `-- Tabla: ${table} · Parte ${parte} de ${dePartes}\n` +
        `-- Rango: ${desde} a ${hasta} · Registros en este archivo: ${chunk.length}\n` +
        `-- Generado: ${new Date().toISOString()} por ${usuario}\n` +
        `-- ORDEN DE RESTAURACION SUGERIDO (para sistema local):\n` +
        `--   productions, profiles, production_services, service_boxes, placas,\n` +
        `--   reoperaciones, recuperaciones, reoperaciones_anuladas, placa_completados,\n` +
        `--   box_completion, historial_operaciones, importaciones, reinicios_produccion, auditoria_comparaciones\n` +
        `-- Los INSERTs usan ON CONFLICT (id) DO NOTHING, seguros de ejecutar varias veces.\n\n`;
      const sql = header + SCHEMA_SQL + '\n' + buildInsert(table, chunk);
      const fileName = `respaldo_${stamp}_(${parte}).sql`;
      files.push({ fileName, sql, tabla: table, parte, dePartes, rowCount: chunk.length });
    }
  }

  if (files.length === 0) {
    throw new Error('No se encontraron registros en el rango de fechas seleccionado.');
  }

  // Descargar todos los archivos secuencialmente.
  for (const f of files) {
    downloadTextFile(f.fileName, f.sql);
    await new Promise((r) => setTimeout(r, 250));
  }

  onProgress({ table: '', tableIndex: tables.length, tableTotal: tables.length, rowsInTable: totalRows, overallPercent: 100, filesCompleted: files.length });

  return { files, totalRows, tablaCounts };
}
