/*
# Master services import, FRONTAL/TRASERA positions and box validation

1. Changes
- `placas.posicion` now accepts FRONTAL and TRASERA (replaces DELANTERA).
- Unique index on (produccion_id, serie, posicion) so one physical plate cannot be duplicated.
- New function `import_master_services` creates each service from the master Excel (one sheet per service), its service type (PZ or JGS) and its physical plates. PZ services create one TRASERA plate per series; JGS services create FRONTAL and TRASERA plates per series. Plates start with box INDEFINIDA.
- `assign_service_boxes` now requires the service type to match the registered type and verifies every consecutive in the range has its plates.

2. Security
- Both functions are admin only and run as SECURITY DEFINER with a fixed search_path.
- EXECUTE is revoked from PUBLIC and anon and granted to authenticated only.

3. Notes
- Existing data is preserved: any DELANTERA value would be converted to FRONTAL before the new check is applied (table is empty after the operational reset).
*/

ALTER TABLE placas DROP CONSTRAINT IF EXISTS placas_posicion_check;
UPDATE placas SET posicion = 'FRONTAL' WHERE posicion = 'DELANTERA';
ALTER TABLE placas ADD CONSTRAINT placas_posicion_check CHECK (posicion IN ('FRONTAL', 'TRASERA'));

CREATE UNIQUE INDEX IF NOT EXISTS placas_serie_posicion_key ON placas (produccion_id, serie, posicion);
CREATE INDEX IF NOT EXISTS placas_produccion_servicio_consecutivo_idx ON placas (produccion_id, servicio, consecutivo);

CREATE OR REPLACE FUNCTION public.import_master_services(p_produccion_id uuid, p_nombre_archivo text, p_servicios jsonb)
RETURNS TABLE (servicios integer, placas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_servicio jsonb;
  v_nombre text;
  v_tipo text;
  v_insertadas integer;
  v_total_servicios integer := 0;
  v_total_placas integer := 0;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM productions WHERE id = p_produccion_id) THEN
    RAISE EXCEPTION 'Producción no encontrada';
  END IF;

  IF jsonb_typeof(p_servicios) <> 'array' OR jsonb_array_length(p_servicios) = 0 THEN
    RAISE EXCEPTION 'No hay servicios para importar';
  END IF;

  FOR v_servicio IN SELECT value FROM jsonb_array_elements(p_servicios)
  LOOP
    v_nombre := btrim(v_servicio->>'nombre');
    v_tipo := v_servicio->>'tipo';

    IF v_nombre IS NULL OR v_nombre = '' THEN
      RAISE EXCEPTION 'Nombre de servicio vacío';
    END IF;

    IF v_tipo IS NULL OR v_tipo NOT IN ('PZ', 'JGS') THEN
      RAISE EXCEPTION 'Tipo de servicio inválido en %', v_nombre;
    END IF;

    IF jsonb_typeof(v_servicio->'placas') <> 'array' OR jsonb_array_length(v_servicio->'placas') = 0 THEN
      RAISE EXCEPTION 'El servicio % no tiene placas', v_nombre;
    END IF;

    IF EXISTS (SELECT 1 FROM production_services WHERE produccion_id = p_produccion_id AND nombre = v_nombre) THEN
      RAISE EXCEPTION 'El servicio % ya existe en esta producción', v_nombre;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_servicio->'placas') AS r(consecutivo integer, serie text)
      JOIN placas pl ON pl.produccion_id = p_produccion_id AND pl.serie = r.serie
    ) THEN
      RAISE EXCEPTION 'Hay series del servicio % que ya existen en esta producción', v_nombre;
    END IF;

    INSERT INTO production_services (produccion_id, nombre, tipo_servicio)
    VALUES (p_produccion_id, v_nombre, v_tipo);

    INSERT INTO placas (produccion_id, consecutivo, serie, posicion, servicio, numero_caja)
    SELECT p_produccion_id, r.consecutivo, r.serie, p.posicion, v_nombre, 'INDEFINIDA'
    FROM jsonb_to_recordset(v_servicio->'placas') AS r(consecutivo integer, serie text)
    CROSS JOIN LATERAL (
      SELECT unnest(CASE WHEN v_tipo = 'JGS' THEN ARRAY['FRONTAL', 'TRASERA'] ELSE ARRAY['TRASERA'] END) AS posicion
    ) p;

    GET DIAGNOSTICS v_insertadas = ROW_COUNT;
    v_total_servicios := v_total_servicios + 1;
    v_total_placas := v_total_placas + v_insertadas;
  END LOOP;

  INSERT INTO importaciones (produccion_id, nombre_archivo, cantidad_registros, cantidad_nuevos, estado_importacion)
  VALUES (p_produccion_id, COALESCE(p_nombre_archivo, ''), v_total_placas, v_total_placas, 'completada');

  UPDATE productions
  SET fecha_ultima_importacion = now(), version_datos = version_datos + 1, updated_at = now()
  WHERE id = p_produccion_id;

  RETURN QUERY SELECT v_total_servicios, v_total_placas;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.import_master_services(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_master_services(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_service_boxes(p_produccion_id uuid, p_servicio text, p_tipo_servicio text, p_boxes jsonb, p_nombre_archivo text DEFAULT ''::text)
RETURNS TABLE (cajas integer, series integer, placas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_box jsonb;
  v_numero_caja text;
  v_inicio integer;
  v_fin integer;
  v_series integer;
  v_expected_plates integer;
  v_actual_plates integer;
  v_distinct_consecutivos integer;
  v_cajas integer := 0;
  v_series_total integer := 0;
  v_placas_total integer := 0;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_servicio IS NULL OR btrim(p_servicio) = '' OR jsonb_typeof(p_boxes) <> 'array' OR jsonb_array_length(p_boxes) = 0 THEN
    RAISE EXCEPTION 'Datos de cajas inválidos';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM production_services
    WHERE produccion_id = p_produccion_id AND nombre = p_servicio AND tipo_servicio = p_tipo_servicio
  ) THEN
    RAISE EXCEPTION 'El servicio no está registrado con ese tipo';
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

    IF v_numero_caja IS NULL OR v_numero_caja = '' OR v_inicio < 0 OR v_fin < v_inicio THEN
      RAISE EXCEPTION 'Rango de caja inválido';
    END IF;

    v_series := v_fin - v_inicio + 1;
    v_expected_plates := v_series * CASE WHEN p_tipo_servicio = 'JGS' THEN 2 ELSE 1 END;

    IF (v_box ? 'cantidad_series') AND (v_box->>'cantidad_series')::integer <> v_series THEN
      RAISE EXCEPTION 'La cantidad de series no coincide con el rango';
    END IF;

    IF (v_box ? 'cantidad_placas') AND (v_box->>'cantidad_placas')::integer <> v_expected_plates THEN
      RAISE EXCEPTION 'La cantidad de placas no coincide con el rango y tipo de servicio';
    END IF;

    SELECT count(*), count(DISTINCT consecutivo)
    INTO v_actual_plates, v_distinct_consecutivos
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;

    IF v_actual_plates <> v_expected_plates OR v_distinct_consecutivos <> v_series THEN
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
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_service_boxes(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_service_boxes(uuid, text, text, jsonb, text) TO authenticated;
