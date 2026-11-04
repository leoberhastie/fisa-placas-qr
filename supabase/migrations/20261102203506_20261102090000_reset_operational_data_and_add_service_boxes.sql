/*
# Reinicio operativo y nuevo esquema de servicios y cajas

1. Purpose
- Reinicia los datos operativos actuales para comenzar con el nuevo método de importación.
- Conserva usuarios, perfiles y producciones existentes.

2. New Tables
- `production_services`: configuración de cada servicio dentro de una producción.
  - `id`: identificador único.
  - `produccion_id`: producción a la que pertenece.
  - `nombre`: nombre del servicio, derivado del nombre de la hoja de Excel.
  - `tipo_servicio`: `PZ` para una placa por serie o `JGS` para frontal y trasera.
  - `activo`: permite desactivar un servicio sin borrar su configuración.
- `service_boxes`: rangos de cajas importados para cada servicio.
  - `numero_caja`: identificador de caja.
  - `consecutivo_inicial` y `consecutivo_final`: rango inclusivo de series.
  - `cantidad_series`: número de series del rango.
  - `cantidad_placas`: cantidad física esperada según PZ o JGS.
  - `nombre_archivo`: archivo de origen.

3. Modified Tables
- No se eliminan columnas de tablas existentes.
- `placas.numero_caja` se reinicia a `INDEFINIDA` al limpiar los datos operativos.
- La posición de las placas continúa usando `FRONTAL` y `TRASERA` para mantener trazabilidad legible y compatible con la aplicación.

4. Reset
- Se eliminan registros de `historial_operaciones`, `recuperaciones`, `reoperaciones`, `placas`, `importaciones` y las tablas nuevas de configuración.
- No se eliminan cuentas, perfiles ni producciones.

5. Security
- RLS se habilita en las tablas nuevas.
- Usuarios autenticados pueden consultar servicios y cajas.
- Solo administradores pueden crear, actualizar o eliminar servicios y rangos de cajas.
- La función `assign_service_boxes` valida internamente que quien llama sea administrador, valida los rangos y realiza la asignación de cajas en una sola operación.
- La función no puede ser llamada por `anon`.
*/

CREATE TABLE IF NOT EXISTS production_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo_servicio text NOT NULL DEFAULT 'JGS' CHECK (tipo_servicio IN ('PZ', 'JGS')),
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produccion_id, nombre)
);

CREATE INDEX IF NOT EXISTS production_services_produccion_idx ON production_services (produccion_id);

CREATE TABLE IF NOT EXISTS service_boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  servicio text NOT NULL,
  numero_caja text NOT NULL,
  tipo_servicio text NOT NULL CHECK (tipo_servicio IN ('PZ', 'JGS')),
  consecutivo_inicial integer NOT NULL CHECK (consecutivo_inicial >= 0),
  consecutivo_final integer NOT NULL CHECK (consecutivo_final >= consecutivo_inicial),
  cantidad_series integer NOT NULL CHECK (cantidad_series > 0),
  cantidad_placas integer NOT NULL CHECK (cantidad_placas > 0),
  nombre_archivo text NOT NULL DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produccion_id, servicio, numero_caja)
);

CREATE INDEX IF NOT EXISTS service_boxes_produccion_servicio_idx ON service_boxes (produccion_id, servicio);
CREATE INDEX IF NOT EXISTS service_boxes_range_idx ON service_boxes (produccion_id, servicio, consecutivo_inicial, consecutivo_final);

ALTER TABLE production_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_boxes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON production_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_boxes TO authenticated;

DROP POLICY IF EXISTS "select_production_services" ON production_services;
CREATE POLICY "select_production_services" ON production_services FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_production_services_admin" ON production_services;
CREATE POLICY "insert_production_services_admin" ON production_services FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "update_production_services_admin" ON production_services;
CREATE POLICY "update_production_services_admin" ON production_services FOR UPDATE TO authenticated USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "delete_production_services_admin" ON production_services;
CREATE POLICY "delete_production_services_admin" ON production_services FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "select_service_boxes" ON service_boxes;
CREATE POLICY "select_service_boxes" ON service_boxes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_service_boxes_admin" ON service_boxes;
CREATE POLICY "insert_service_boxes_admin" ON service_boxes FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "update_service_boxes_admin" ON service_boxes;
CREATE POLICY "update_service_boxes_admin" ON service_boxes FOR UPDATE TO authenticated USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "delete_service_boxes_admin" ON service_boxes;
CREATE POLICY "delete_service_boxes_admin" ON service_boxes FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');

DELETE FROM historial_operaciones;
DELETE FROM recuperaciones;
DELETE FROM reoperaciones;
DELETE FROM service_boxes;
DELETE FROM production_services;
DELETE FROM placas;
DELETE FROM importaciones;

CREATE OR REPLACE FUNCTION assign_service_boxes(
  p_produccion_id uuid,
  p_servicio text,
  p_tipo_servicio text,
  p_boxes jsonb,
  p_nombre_archivo text DEFAULT ''
)
RETURNS TABLE (cajas integer, series integer, placas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box jsonb;
  v_numero_caja text;
  v_inicio integer;
  v_fin integer;
  v_series integer;
  v_expected_plates integer;
  v_actual_plates integer;
  v_cajas integer := 0;
  v_series_total integer := 0;
  v_placas_total integer := 0;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_tipo_servicio NOT IN ('PZ', 'JGS') THEN
    RAISE EXCEPTION 'Tipo de servicio inválido';
  END IF;

  IF p_servicio IS NULL OR btrim(p_servicio) = '' OR jsonb_typeof(p_boxes) <> 'array' OR jsonb_array_length(p_boxes) = 0 THEN
    RAISE EXCEPTION 'Datos de cajas inválidos';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM placas WHERE produccion_id = p_produccion_id AND servicio = p_servicio) THEN
    RAISE EXCEPTION 'El servicio no tiene placas registradas';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_boxes) WITH ORDINALITY AS a(numero_caja text, consecutivo_inicial integer, consecutivo_final integer, cantidad_series integer, cantidad_placas integer, ord bigint)
    JOIN jsonb_to_recordset(p_boxes) WITH ORDINALITY AS b(numero_caja text, consecutivo_inicial integer, consecutivo_final integer, cantidad_series integer, cantidad_placas integer, ord bigint)
      ON a.ord < b.ord
     AND a.consecutivo_inicial <= b.consecutivo_final
     AND b.consecutivo_inicial <= a.consecutivo_final
  ) THEN
    RAISE EXCEPTION 'Los rangos de cajas se superponen';
  END IF;

  DELETE FROM service_boxes WHERE produccion_id = p_produccion_id AND servicio = p_servicio;
  UPDATE placas SET numero_caja = 'INDEFINIDA' WHERE produccion_id = p_produccion_id AND servicio = p_servicio;

  FOR v_box IN SELECT value FROM jsonb_array_elements(p_boxes)
  LOOP
    v_numero_caja := btrim(v_box->>'numero_caja');
    v_inicio := (v_box->>'consecutivo_inicial')::integer;
    v_fin := (v_box->>'consecutivo_final')::integer;
    v_series := v_fin - v_inicio + 1;
    v_expected_plates := v_series * CASE WHEN p_tipo_servicio = 'JGS' THEN 2 ELSE 1 END;

    IF v_numero_caja IS NULL OR v_numero_caja = '' OR v_inicio < 0 OR v_fin < v_inicio THEN
      RAISE EXCEPTION 'Rango de caja inválido';
    END IF;

    IF (v_box ? 'cantidad_series') AND (v_box->>'cantidad_series')::integer <> v_series THEN
      RAISE EXCEPTION 'La cantidad de series no coincide con el rango';
    END IF;

    IF (v_box ? 'cantidad_placas') AND (v_box->>'cantidad_placas')::integer <> v_expected_plates THEN
      RAISE EXCEPTION 'La cantidad de placas no coincide con el rango y tipo de servicio';
    END IF;

    SELECT count(*) INTO v_actual_plates
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;

    IF v_actual_plates <> v_expected_plates THEN
      RAISE EXCEPTION 'El rango de caja no coincide con las placas del servicio';
    END IF;

    INSERT INTO service_boxes (
      produccion_id, servicio, numero_caja, tipo_servicio,
      consecutivo_inicial, consecutivo_final, cantidad_series, cantidad_placas, nombre_archivo
    ) VALUES (
      p_produccion_id, p_servicio, v_numero_caja, p_tipo_servicio,
      v_inicio, v_fin, v_series, v_expected_plates, COALESCE(p_nombre_archivo, '')
    );

    UPDATE placas SET numero_caja = v_numero_caja
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;

    v_cajas := v_cajas + 1;
    v_series_total := v_series_total + v_series;
    v_placas_total := v_placas_total + v_expected_plates;
  END LOOP;

  RETURN QUERY SELECT v_cajas, v_series_total, v_placas_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION assign_service_boxes(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assign_service_boxes(uuid, text, text, jsonb, text) TO authenticated;
