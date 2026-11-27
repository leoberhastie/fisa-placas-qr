-- =====================================================================
-- FISA-PLACAS Reoperaciones · Esquema completo de la base de datos
-- PostgreSQL estándar (compatible con servidor local, pgAdmin o psql)
-- Generado a partir del esquema real en Supabase el 2026-11-27
--
-- Uso en sistema local:
--   psql -U usuario -d base_datos -f database/esquema_completo.sql
-- Luego carga los respaldos generados en Ajustes:
--   psql -U usuario -d base_datos -f respaldo_27-11-26_09-20-01_(1).sql
--
-- Nota: las columnas created_by / completada_by / usuario_id referencian
-- usuarios del sistema de autenticación de Supabase; en local déjalas como
-- uuid simples (sin referencia foránea) a menos que repliques auth.users.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'operador',
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE INDEX IF NOT EXISTS placas_produccion_serie_posicion_uniq ON placas (produccion_id, serie, posicion);
CREATE INDEX IF NOT EXISTS placas_produccion_id_idx ON placas (produccion_id);
CREATE INDEX IF NOT EXISTS placas_serie_idx ON placas (serie);
CREATE INDEX IF NOT EXISTS placas_numero_caja_idx ON placas (numero_caja);
CREATE INDEX IF NOT EXISTS historial_fecha_hora_idx ON historial_operaciones (fecha_hora);
CREATE INDEX IF NOT EXISTS reoperaciones_fecha_hora_idx ON reoperaciones (fecha_hora);
CREATE INDEX IF NOT EXISTS recuperaciones_fecha_hora_idx ON recuperaciones (fecha_hora);
