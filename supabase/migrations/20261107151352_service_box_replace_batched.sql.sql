/*
# Batched replacement of service box assignments

The single-call replacement function timed out on services with many plates, because it
rewrote every plate of the service and every box in one statement. This migration splits the
replacement into small steps that the app calls in sequence, each well within the time limit.

1. New functions
- `begin_service_box_replace(produccion_id, servicio)`: deletes the current boxes and box
  completion states of the service (small tables).
- `clear_service_box_numbers_range(produccion_id, servicio, consecutivo_desde, consecutivo_hasta)`:
  clears the box number of the plates in a consecutive range. Called repeatedly over ranges.
- `insert_service_boxes_batch(produccion_id, servicio, tipo_servicio, boxes)`: inserts a batch
  of boxes and assigns their box number to the plates in their consecutive range.

2. Removed
- `replace_service_boxes_plan`: replaced by the three steps above.

3. Security
- All functions are SECURITY DEFINER and check that the caller is an admin.
- EXECUTE is revoked from PUBLIC and anon; granted to authenticated only.

4. Notes
- `build_service_box_plan` is unchanged and remains the read-only preview.
*/

CREATE OR REPLACE FUNCTION public.begin_service_box_replace(
  p_produccion_id uuid,
  p_servicio text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  DELETE FROM service_boxes
  WHERE produccion_id = p_produccion_id AND servicio = p_servicio;

  DELETE FROM box_completion
  WHERE produccion_id = p_produccion_id AND servicio = p_servicio;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_service_box_numbers_range(
  p_produccion_id uuid,
  p_servicio text,
  p_consecutivo_desde integer,
  p_consecutivo_hasta integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE placas pl
  SET numero_caja = ''
  WHERE pl.produccion_id = p_produccion_id
    AND pl.servicio = p_servicio
    AND pl.consecutivo BETWEEN p_consecutivo_desde AND p_consecutivo_hasta
    AND pl.numero_caja <> '';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_service_boxes_batch(
  p_produccion_id uuid,
  p_servicio text,
  p_tipo_servicio text,
  p_boxes jsonb
)
RETURNS TABLE(cajas_creadas integer, series_asignadas integer, placas_asignadas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_max_consecutivo integer;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_tipo_servicio NOT IN ('PZ', 'JGS') THEN
    RAISE EXCEPTION 'Tipo de servicio inválido';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM production_services ps
    WHERE ps.produccion_id = p_produccion_id AND ps.nombre = p_servicio AND ps.tipo_servicio = p_tipo_servicio
  ) THEN
    RAISE EXCEPTION 'El servicio no está registrado con ese tipo';
  END IF;

  IF p_boxes IS NULL OR jsonb_typeof(p_boxes) <> 'array' OR jsonb_array_length(p_boxes) = 0 THEN
    RAISE EXCEPTION 'El lote de cajas está vacío';
  END IF;

  SELECT max(pl.consecutivo) INTO v_max_consecutivo
  FROM placas pl
  WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio;

  INSERT INTO service_boxes (
    produccion_id, servicio, numero_caja, tipo_servicio,
    consecutivo_inicial, consecutivo_final,
    serie_inicial, serie_final,
    cantidad_series, cantidad_placas, nombre_archivo,
    parcialidad, es_parcial
  )
  SELECT p_produccion_id, p_servicio, x.numero_caja, p_tipo_servicio,
    x.consecutivo_inicial, x.consecutivo_final,
    x.serie_inicial, x.serie_final,
    x.cantidad_series, x.cantidad_placas, 'Asignación por rango',
    1, x.consecutivo_final < v_max_consecutivo
  FROM jsonb_to_recordset(p_boxes) AS x(
    numero_caja text,
    consecutivo_inicial integer,
    consecutivo_final integer,
    serie_inicial text,
    serie_final text,
    cantidad_series integer,
    cantidad_placas integer
  );

  UPDATE placas pl
  SET numero_caja = x.numero_caja
  FROM jsonb_to_recordset(p_boxes) AS x(
    numero_caja text,
    consecutivo_inicial integer,
    consecutivo_final integer
  )
  WHERE pl.produccion_id = p_produccion_id
    AND pl.servicio = p_servicio
    AND pl.consecutivo BETWEEN x.consecutivo_inicial AND x.consecutivo_final;

  RETURN QUERY
  SELECT count(*)::integer, coalesce(sum(x.cantidad_series), 0)::integer, coalesce(sum(x.cantidad_placas), 0)::integer
  FROM jsonb_to_recordset(p_boxes) AS x(cantidad_series integer, cantidad_placas integer);
END;
$function$;

DROP FUNCTION IF EXISTS public.replace_service_boxes_plan(uuid, text, text, text, text, integer);

REVOKE EXECUTE ON FUNCTION public.begin_service_box_replace(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_service_box_numbers_range(uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.insert_service_boxes_batch(uuid, text, text, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.begin_service_box_replace(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_service_box_numbers_range(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_service_boxes_batch(uuid, text, text, jsonb) TO authenticated;
