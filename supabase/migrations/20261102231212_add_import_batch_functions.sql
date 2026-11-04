/*
# Add bounded import functions

1. Purpose
- Add server-side operations that accept one service and one batch per request.
- Series and boxes are limited to 5,000 records per request.
- The caller marks the first and last batch; the database validates the sequence and admin role.

2. New functions
- `import_master_service_batch`: inserts one service's series batch and creates import history on the last batch.
- `assign_service_boxes_batch`: replaces assignments on the first batch and appends subsequent batches while checking overlaps.

3. Security
- Both functions use SECURITY DEFINER with a fixed search_path.
- EXECUTE is revoked from PUBLIC and anon and granted only to authenticated.
- Both functions require the admin role.

4. Data safety
- No tables or columns are removed or changed.
- A failed batch stops the frontend and reports the affected service and batch.
*/

CREATE OR REPLACE FUNCTION public.import_master_service_batch(
  p_produccion_id uuid,
  p_nombre text,
  p_tipo text,
  p_placas jsonb,
  p_nombre_archivo text DEFAULT '',
  p_first_batch boolean DEFAULT true,
  p_last_batch boolean DEFAULT true,
  p_total_placas integer DEFAULT 0
)
RETURNS TABLE (servicio text, placas_insertadas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_insertadas integer;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_nombre IS NULL OR btrim(p_nombre) = '' OR p_tipo NOT IN ('PZ', 'JGS') THEN
    RAISE EXCEPTION 'Servicio inválido';
  END IF;
  IF jsonb_typeof(p_placas) <> 'array' OR jsonb_array_length(p_placas) = 0 OR jsonb_array_length(p_placas) > 5000 THEN
    RAISE EXCEPTION 'El lote debe contener entre 1 y 5000 series';
  END IF;

  IF p_first_batch THEN
    IF EXISTS (SELECT 1 FROM production_services WHERE produccion_id = p_produccion_id AND nombre = p_nombre) THEN
      RAISE EXCEPTION 'El servicio ya existe en esta producción';
    END IF;
    INSERT INTO production_services (produccion_id, nombre, tipo_servicio)
    VALUES (p_produccion_id, btrim(p_nombre), p_tipo);
  ELSIF NOT EXISTS (
    SELECT 1 FROM production_services
    WHERE produccion_id = p_produccion_id AND nombre = p_nombre AND tipo_servicio = p_tipo
  ) THEN
    RAISE EXCEPTION 'El servicio no está preparado para continuar la importación';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_placas) AS incoming(consecutivo integer, serie text)
    JOIN placas existing ON existing.produccion_id = p_produccion_id AND existing.serie = incoming.serie
  ) THEN
    RAISE EXCEPTION 'Una serie del lote ya existe en esta producción';
  END IF;

  INSERT INTO placas (produccion_id, consecutivo, serie, posicion, servicio, numero_caja)
  SELECT p_produccion_id, incoming.consecutivo, incoming.serie, position_name, btrim(p_nombre), 'INDEFINIDA'
  FROM jsonb_to_recordset(p_placas) AS incoming(consecutivo integer, serie text)
  CROSS JOIN LATERAL (
    SELECT unnest(CASE WHEN p_tipo = 'JGS' THEN ARRAY['FRONTAL', 'TRASERA'] ELSE ARRAY['TRASERA'] END) AS position_name
  ) positions;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;

  IF p_last_batch THEN
    INSERT INTO importaciones (produccion_id, nombre_archivo, cantidad_registros, cantidad_nuevos, estado_importacion)
    VALUES (p_produccion_id, COALESCE(p_nombre_archivo, ''), COALESCE(p_total_placas, v_insertadas), COALESCE(p_total_placas, v_insertadas), 'completada');
    UPDATE productions
    SET fecha_ultima_importacion = now(), version_datos = version_datos + 1, updated_at = now()
    WHERE id = p_produccion_id;
  END IF;

  RETURN QUERY SELECT btrim(p_nombre), v_insertadas;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.import_master_service_batch(uuid, text, text, jsonb, text, boolean, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_master_service_batch(uuid, text, text, jsonb, text, boolean, boolean, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_service_boxes_batch(
  p_produccion_id uuid,
  p_servicio text,
  p_tipo_servicio text,
  p_boxes jsonb,
  p_nombre_archivo text DEFAULT '',
  p_replace_existing boolean DEFAULT true
)
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
  IF public.current_user_role() <> 'admin' THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF jsonb_typeof(p_boxes) <> 'array' OR jsonb_array_length(p_boxes) = 0 OR jsonb_array_length(p_boxes) > 5000 THEN
    RAISE EXCEPTION 'El lote debe contener entre 1 y 5000 cajas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM production_services
    WHERE produccion_id = p_produccion_id AND nombre = p_servicio AND tipo_servicio = p_tipo_servicio
  ) THEN RAISE EXCEPTION 'El servicio no está registrado con ese tipo'; END IF;

  IF p_replace_existing THEN
    DELETE FROM service_boxes WHERE produccion_id = p_produccion_id AND servicio = p_servicio;
    UPDATE placas SET numero_caja = 'INDEFINIDA' WHERE produccion_id = p_produccion_id AND servicio = p_servicio;
  END IF;

  FOR v_box IN SELECT value FROM jsonb_array_elements(p_boxes)
  LOOP
    v_numero_caja := btrim(v_box->>'numero_caja');
    v_inicio := (v_box->>'consecutivo_inicial')::integer;
    v_fin := (v_box->>'consecutivo_final')::integer;
    IF v_numero_caja IS NULL OR v_numero_caja = '' OR v_inicio < 0 OR v_fin < v_inicio THEN RAISE EXCEPTION 'Rango de caja inválido'; END IF;
    IF EXISTS (
      SELECT 1 FROM service_boxes existing
      WHERE existing.produccion_id = p_produccion_id AND existing.servicio = p_servicio
        AND existing.consecutivo_inicial <= v_fin AND v_inicio <= existing.consecutivo_final
    ) THEN RAISE EXCEPTION 'El rango de caja se superpone con una caja ya asignada'; END IF;

    v_series := v_fin - v_inicio + 1;
    v_expected_plates := v_series * CASE WHEN p_tipo_servicio = 'JGS' THEN 2 ELSE 1 END;
    IF (v_box ? 'cantidad_series') AND (v_box->>'cantidad_series')::integer <> v_series THEN RAISE EXCEPTION 'La cantidad de series no coincide con el rango'; END IF;
    IF (v_box ? 'cantidad_placas') AND (v_box->>'cantidad_placas')::integer <> v_expected_plates THEN RAISE EXCEPTION 'La cantidad de placas no coincide con el rango y tipo de servicio'; END IF;

    SELECT count(*), count(DISTINCT consecutivo) INTO v_actual_plates, v_distinct_consecutivos
    FROM placas WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;
    IF v_actual_plates <> v_expected_plates OR v_distinct_consecutivos <> v_series THEN RAISE EXCEPTION 'El rango de caja no coincide con las placas del servicio'; END IF;

    INSERT INTO service_boxes (produccion_id, servicio, numero_caja, tipo_servicio, consecutivo_inicial, consecutivo_final, cantidad_series, cantidad_placas, nombre_archivo)
    VALUES (p_produccion_id, p_servicio, v_numero_caja, p_tipo_servicio, v_inicio, v_fin, v_series, v_expected_plates, COALESCE(p_nombre_archivo, ''));
    UPDATE placas SET numero_caja = v_numero_caja
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;

    v_cajas := v_cajas + 1;
    v_series_total := v_series_total + v_series;
    v_placas_total := v_placas_total + v_expected_plates;
  END LOOP;
  RETURN QUERY SELECT v_cajas, v_series_total, v_placas_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_service_boxes_batch(uuid, text, text, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_service_boxes_batch(uuid, text, text, jsonb, text, boolean) TO authenticated;
