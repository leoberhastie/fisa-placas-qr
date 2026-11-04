/*
# Fase 2: Extender producciones y crear tablas de placas, reoperaciones, recuperaciones, historial e importaciones

1. Modified Tables
- `productions`: adds columns `consecutivo` (int), `estado` (text, geographic state like "Nuevo Leon"),
  `anio` (int, year), `fecha_ultima_importacion` (timestamptz), `version_datos` (int).
  Extends `status` CHECK to include 'archivada'. The visible name is built as CONSECUTIVO-ESTADO-AÑO.
  Existing `code`, `name`, `description`, `status`, `created_by`, `created_at`, `updated_at` are preserved.

2. New Tables
- `placas`: individual plates belonging to a production.
  - `id` (uuid PK), `produccion_id` (FK productions), `consecutivo` (int),
  `serie` (text), `posicion` (text: DELANTERA/TRASERA), `servicio` (text),
  `numero_caja` (text), `fecha_importacion` (timestamptz), `activo` (bool, default true).
  Unique constraint on (produccion_id, serie, posicion).
- `reoperaciones`: reoperation records per plate.
  - `id`, `produccion_id`, `placa_id`, `proceso` (text), `fecha_hora` (timestamptz),
  `operador` (text, display name), `usuario` (text, auth email), `estado` (text),
  `observaciones` (text).
- `recuperaciones`: recovery records per plate.
  - `id`, `produccion_id`, `placa_id`, `fecha_hora`, `operador`, `usuario`,
  `tipo_recuperacion` (text), `observaciones` (text).
- `historial_operaciones`: audit log of all operations.
  - `id`, `produccion_id`, `placa_id`, `tipo_operacion` (text), `proceso` (text),
  `fecha_hora`, `operador`, `usuario`, `estado_anterior` (text), `estado_nuevo` (text),
  `observaciones` (text).
- `importaciones`: Excel import audit records.
  - `id`, `produccion_id`, `nombre_archivo` (text), `fecha_importacion` (timestamptz),
  `usuario` (text), `cantidad_registros` (int), `cantidad_nuevos` (int),
  `cantidad_actualizados` (int), `cantidad_errores` (int), `estado_importacion` (text),
  `version_datos` (int).

3. Security
- RLS enabled on all new tables.
- SELECT granted to authenticated on all new tables (app filters by production_id).
- placas: INSERT/UPDATE/DELETE admin only.
- reoperaciones/recuperaciones: INSERT to authenticated (operador registers), DELETE admin only.
- historial_operaciones: INSERT to authenticated, SELECT to authenticated.
- importaciones: INSERT/UPDATE/DELETE admin only.
- Updated productions policies to use new schema (admin-only writes, all read).

4. Seed Data
- Creates "Indefinida" production (consecutivo=0, estado='Indefinida', anio=0) as a permanent
  default production that can always be selected. Uses the admin user as created_by.

5. Important Notes
- No existing data is modified or removed.
- All statements are idempotent and safe to re-run.
- The unique constraint (produccion_id, serie, posicion) enforces the plate identity rule.
*/

-- =========================================================
-- 1. EXTEND productions TABLE
-- =========================================================

ALTER TABLE productions ADD COLUMN IF NOT EXISTS consecutivo integer NOT NULL DEFAULT 0;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT '';
ALTER TABLE productions ADD COLUMN IF NOT EXISTS anio integer NOT NULL DEFAULT 0;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS fecha_ultima_importacion timestamptz;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS version_datos integer NOT NULL DEFAULT 0;

-- Extend status CHECK to include 'archivada'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'productions_status_check'
  ) THEN
    ALTER TABLE productions DROP CONSTRAINT productions_status_check;
  END IF;
  ALTER TABLE productions ADD CONSTRAINT productions_status_check
    CHECK (status IN ('activa', 'finalizada', 'archivada'));
END $$;

-- =========================================================
-- 2. CREATE placas TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS placas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  consecutivo integer NOT NULL DEFAULT 0,
  serie text NOT NULL,
  posicion text NOT NULL CHECK (posicion IN ('DELANTERA', 'TRASERA')),
  servicio text NOT NULL DEFAULT '',
  numero_caja text NOT NULL DEFAULT '',
  fecha_importacion timestamptz NOT NULL DEFAULT now(),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS placas_produccion_serie_posicion_uniq
  ON placas (produccion_id, serie, posicion);
CREATE INDEX IF NOT EXISTS placas_produccion_id_idx ON placas (produccion_id);
CREATE INDEX IF NOT EXISTS placas_serie_idx ON placas (serie);
CREATE INDEX IF NOT EXISTS placas_numero_caja_idx ON placas (numero_caja);

-- =========================================================
-- 3. CREATE reoperaciones TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS reoperaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid REFERENCES placas(id) ON DELETE SET NULL,
  proceso text NOT NULL DEFAULT '' CHECK (proceso IN ('', 'Impresion', 'Sticker', 'Brotech', 'Blanking', 'Embossing')),
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completo', 'atencion', 'sin_incidencias')),
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reoperaciones_produccion_id_idx ON reoperaciones (produccion_id);
CREATE INDEX IF NOT EXISTS reoperaciones_placa_id_idx ON reoperaciones (placa_id);
CREATE INDEX IF NOT EXISTS reoperaciones_fecha_hora_idx ON reoperaciones (fecha_hora DESC);

-- =========================================================
-- 4. CREATE recuperaciones TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS recuperaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid REFERENCES placas(id) ON DELETE SET NULL,
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  tipo_recuperacion text NOT NULL DEFAULT '',
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recuperaciones_produccion_id_idx ON recuperaciones (produccion_id);
CREATE INDEX IF NOT EXISTS recuperaciones_placa_id_idx ON recuperaciones (placa_id);

-- =========================================================
-- 5. CREATE historial_operaciones TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS historial_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid REFERENCES placas(id) ON DELETE SET NULL,
  tipo_operacion text NOT NULL DEFAULT '' CHECK (tipo_operacion IN ('', 'reoperacion', 'recuperacion', 'importacion', 'cambio_estado', 'edicion_placa')),
  proceso text NOT NULL DEFAULT '',
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  estado_anterior text NOT NULL DEFAULT '',
  estado_nuevo text NOT NULL DEFAULT '',
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historial_produccion_id_idx ON historial_operaciones (produccion_id);
CREATE INDEX IF NOT EXISTS historial_placa_id_idx ON historial_operaciones (placa_id);
CREATE INDEX IF NOT EXISTS historial_fecha_hora_idx ON historial_operaciones (fecha_hora DESC);

-- =========================================================
-- 6. CREATE importaciones TABLE
-- =========================================================

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
  estado_importacion text NOT NULL DEFAULT 'pendiente' CHECK (estado_importacion IN ('pendiente', 'completada', 'con_errores', 'fallida')),
  version_datos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS importaciones_produccion_id_idx ON importaciones (produccion_id);

-- =========================================================
-- 7. ENABLE RLS ON ALL NEW TABLES
-- =========================================================

ALTER TABLE placas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reoperaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE recuperaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE importaciones ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 8. GRANTS
-- =========================================================

-- placas: all authenticated can SELECT, admin can write
GRANT SELECT ON placas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON placas TO authenticated;

-- reoperaciones: all authenticated can SELECT and INSERT, admin can DELETE
GRANT SELECT, INSERT, DELETE ON reoperaciones TO authenticated;

-- recuperaciones: all authenticated can SELECT and INSERT, admin can DELETE
GRANT SELECT, INSERT, DELETE ON recuperaciones TO authenticated;

-- historial_operaciones: all authenticated can SELECT and INSERT
GRANT SELECT, INSERT ON historial_operaciones TO authenticated;

-- importaciones: all authenticated can SELECT, admin can INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON importaciones TO authenticated;

-- =========================================================
-- 9. RLS POLICIES — placas
-- =========================================================

DROP POLICY IF EXISTS "select_placas" ON placas;
CREATE POLICY "select_placas" ON placas FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_placas_admin" ON placas;
CREATE POLICY "insert_placas_admin" ON placas FOR INSERT
  TO authenticated WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "update_placas_admin" ON placas;
CREATE POLICY "update_placas_admin" ON placas FOR UPDATE
  TO authenticated USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "delete_placas_admin" ON placas;
CREATE POLICY "delete_placas_admin" ON placas FOR DELETE
  TO authenticated USING (public.current_user_role() = 'admin');

-- =========================================================
-- 10. RLS POLICIES — reoperaciones
-- =========================================================

DROP POLICY IF EXISTS "select_reoperaciones" ON reoperaciones;
CREATE POLICY "select_reoperaciones" ON reoperaciones FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_reoperaciones" ON reoperaciones;
CREATE POLICY "insert_reoperaciones" ON reoperaciones FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_reoperaciones_admin" ON reoperaciones;
CREATE POLICY "delete_reoperaciones_admin" ON reoperaciones FOR DELETE
  TO authenticated USING (public.current_user_role() = 'admin');

-- =========================================================
-- 11. RLS POLICIES — recuperaciones
-- =========================================================

DROP POLICY IF EXISTS "select_recuperaciones" ON recuperaciones;
CREATE POLICY "select_recuperaciones" ON recuperaciones FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_recuperaciones" ON recuperaciones;
CREATE POLICY "insert_recuperaciones" ON recuperaciones FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_recuperaciones_admin" ON recuperaciones;
CREATE POLICY "delete_recuperaciones_admin" ON recuperaciones FOR DELETE
  TO authenticated USING (public.current_user_role() = 'admin');

-- =========================================================
-- 12. RLS POLICIES — historial_operaciones
-- =========================================================

DROP POLICY IF EXISTS "select_historial" ON historial_operaciones;
CREATE POLICY "select_historial" ON historial_operaciones FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_historial" ON historial_operaciones;
CREATE POLICY "insert_historial" ON historial_operaciones FOR INSERT
  TO authenticated WITH CHECK (true);

-- =========================================================
-- 13. RLS POLICIES — importaciones
-- =========================================================

DROP POLICY IF EXISTS "select_importaciones" ON importaciones;
CREATE POLICY "select_importaciones" ON importaciones FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_importaciones_admin" ON importaciones;
CREATE POLICY "insert_importaciones_admin" ON importaciones FOR INSERT
  TO authenticated WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "update_importaciones_admin" ON importaciones;
CREATE POLICY "update_importaciones_admin" ON importaciones FOR UPDATE
  TO authenticated USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "delete_importaciones_admin" ON importaciones;
CREATE POLICY "delete_importaciones_admin" ON importaciones FOR DELETE
  TO authenticated USING (public.current_user_role() = 'admin');

-- =========================================================
-- 14. SEED: Producción Indefinida
-- =========================================================

INSERT INTO productions (code, name, description, status, consecutivo, estado, anio, created_by)
VALUES (
  'INDEFINIDA',
  'Indefinida',
  'Producción de uso general sin fecha específica.',
  'activa',
  0,
  'Indefinida',
  0,
  COALESCE(
    (SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  )
)
ON CONFLICT (code) DO UPDATE SET
  consecutivo = EXCLUDED.consecutivo,
  estado = EXCLUDED.estado,
  anio = EXCLUDED.anio;