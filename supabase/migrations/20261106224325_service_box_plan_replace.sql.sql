/*
# Automatic box plan by serial range, with replacement of a service's boxes

## Summary
Adds three admin-only database functions that let the manager assign boxes to a whole service
from a serial range instead of an Excel file.

1. `get_service_box_bounds`: one read that returns the service's first and last serial,
   the total plate count, and how many boxes already exist. Used to prefill the form.
2. `build_service_box_plan`: read-only. Calculates the box distribution for a range and
   returns one row per box. Box numbers use the same digit width as the service's current
   first box (for example "001" keeps 3 digits, "0001" keeps 4). Without existing boxes, 3 digits are used.
3. `replace_service_boxes_plan`: deletes the service's current boxes, clears the completion
   marks of those boxes, resets the box number of the service's plates, and inserts the new plan.

## Rules
- A pair (JGS) of plates counts as 2 plates per serial; PZ counts 1.
- "Placas por caja" is the maximum plates per box. For JGS, 100 plates means 50 games.
- The last box may hold fewer plates than the maximum.
- The range must contain every plate of the service (no gaps or extra plates).

## Security
- The three functions check that the caller is an admin.
- EXECUTE is revoked from PUBLIC and anon and granted to authenticated only.

## Notes
- Replacing boxes is not reversible from this function. The client asks for confirmation first.
- Box completion marks belong to box numbers, so they are removed for the replaced service.
*/

CREATE OR REPLACE FUNCTION public.get_service_box_bounds(
  p_produccion_id uuid,
  p_servicio text
)
RETURNS TABLE(
  placas_total bigint,
  consecutivos_distintos bigint,
  consecutivo_minimo integer,
  consecutivo_maximo integer,
  serie_inicial text,
  serie_final text,
  cajas_existentes bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH rango AS (
    SELECT count(*) AS total,
           count(DISTINCT pl.consecutivo) AS distintos,
           min(pl.consecutivo) AS minimo,
           max(pl.consecutivo) AS maximo
    FROM placas pl
    WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio
  )
  SELECT r.total,
         r.distintos,
         r.minimo,
         r.maximo,
         (SELECT pl.serie FROM placas pl
          WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio AND pl.consecutivo = r.minimo
          LIMIT 1),
         (SELECT pl.serie FROM placas pl
          WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio AND pl.consecutivo = r.maximo
          LIMIT 1),
         (SELECT count(*) FROM service_boxes sb
          WHERE sb.produccion_id = p_produccion_id AND sb.servicio = p_servicio)
  FROM rango r;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_service_box_bounds(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_box_bounds(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.build_service_box_plan(
  p_produccion_id uuid,
  p_servicio text,
  p_tipo_servicio text,
  p_serie_inicial text,
  p_serie_final text,
  p_piezas_por_caja integer
)
RETURNS TABLE(
  orden integer,
  numero_caja text,
  consecutivo_inicial integer,
  consecutivo_final integer,
  serie_inicial text,
  serie_final text,
  cantidad_series integer,
  cantidad_placas integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_factor integer;
  v_series_por_caja integer;
  v_inicio integer;
  v_fin integer;
  v_placas_rango bigint;
  v_consecutivos_rango bigint;
  v_cajas integer;
  v_width integer := 3;
  v_primera_caja text;
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

  v_factor := CASE WHEN p_tipo_servicio = 'JGS' THEN 2 ELSE 1 END;

  IF p_piezas_por_caja IS NULL OR p_piezas_por_caja <= 0 OR p_piezas_por_caja % v_factor <> 0 THEN
    RAISE EXCEPTION 'Las placas por caja deben ser un número positivo y múltiplo de %', v_factor;
  END IF;

  v_series_por_caja := p_piezas_por_caja / v_factor;

  SELECT pl.consecutivo INTO v_inicio
  FROM placas pl
  WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio
    AND pl.serie = btrim(upper(p_serie_inicial))
  LIMIT 1;

  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'La serie inicial % no existe en el servicio %', p_serie_inicial, p_servicio;
  END IF;

  SELECT pl.consecutivo INTO v_fin
  FROM placas pl
  WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio
    AND pl.serie = btrim(upper(p_serie_final))
  LIMIT 1;

  IF v_fin IS NULL THEN
    RAISE EXCEPTION 'La serie final % no existe en el servicio %', p_serie_final, p_servicio;
  END IF;

  IF v_fin < v_inicio THEN
    RAISE EXCEPTION 'La serie final tiene un consecutivo menor que la serie inicial';
  END IF;

  SELECT count(*), count(DISTINCT pl.consecutivo) INTO v_placas_rango, v_consecutivos_rango
  FROM placas pl
  WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio
    AND pl.consecutivo BETWEEN v_inicio AND v_fin;

  IF v_consecutivos_rango <> (v_fin - v_inicio + 1) OR v_placas_rango <> (v_fin - v_inicio + 1) * v_factor THEN
    RAISE EXCEPTION 'El rango seleccionado no coincide con las placas del servicio (faltan o sobran placas)';
  END IF;

  SELECT sb.numero_caja INTO v_primera_caja
  FROM service_boxes sb
  WHERE sb.produccion_id = p_produccion_id AND sb.servicio = p_servicio
  ORDER BY sb.consecutivo_inicial
  LIMIT 1;

  IF v_primera_caja IS NOT NULL AND v_primera_caja ~ '^[0-9]+$' THEN
    v_width := length(v_primera_caja);
  END IF;

  v_cajas := (v_fin - v_inicio + 1 + v_series_por_caja - 1) / v_series_por_caja;

  RETURN QUERY
  WITH cajas AS (
    SELECT g.k + 1 AS num,
           v_inicio + g.k * v_series_por_caja AS ini,
           LEAST(v_inicio + (g.k + 1) * v_series_por_caja - 1, v_fin) AS fin
    FROM generate_series(0, v_cajas - 1) AS g(k)
  ),
  serie_por_consecutivo AS (
    SELECT pl.consecutivo, min(pl.serie) AS serie
    FROM placas pl
    WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio
      AND pl.consecutivo BETWEEN v_inicio AND v_fin
    GROUP BY pl.consecutivo
  )
  SELECT c.num,
         repeat('0', greatest(v_width - length(c.num::text), 0)) || c.num::text,
         c.ini,
         c.fin,
         si.serie,
         sf.serie,
         c.fin - c.ini + 1,
         (c.fin - c.ini + 1) * v_factor
  FROM cajas c
  JOIN serie_por_consecutivo si ON si.consecutivo = c.ini
  JOIN serie_por_consecutivo sf ON sf.consecutivo = c.fin
  ORDER BY c.num;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.build_service_box_plan(uuid, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.build_service_box_plan(uuid, text, text, text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_service_boxes_plan(
  p_produccion_id uuid,
  p_servicio text,
  p_tipo_servicio text,
  p_serie_inicial text,
  p_serie_final text,
  p_piezas_por_caja integer
)
RETURNS TABLE(
  cajas_creadas integer,
  series_asignadas integer,
  placas_asignadas integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_max_consecutivo integer;
  v_inicio integer;
  v_fin integer;
  v_spb integer;
  v_series_total integer;
  v_placas_total integer;
  v_cajas integer;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  CREATE TEMP TABLE service_box_plan_tmp ON COMMIT DROP AS
  SELECT * FROM public.build_service_box_plan(
    p_produccion_id, p_servicio, p_tipo_servicio, p_serie_inicial, p_serie_final, p_piezas_por_caja
  );

  SELECT min(t.consecutivo_inicial), max(t.consecutivo_final), max(t.cantidad_series),
         sum(t.cantidad_series), sum(t.cantidad_placas), count(*)
  INTO v_inicio, v_fin, v_spb, v_series_total, v_placas_total, v_cajas
  FROM service_box_plan_tmp t;

  SELECT max(pl.consecutivo) INTO v_max_consecutivo
  FROM placas pl
  WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio;

  DELETE FROM service_boxes sb
  WHERE sb.produccion_id = p_produccion_id AND sb.servicio = p_servicio;

  DELETE FROM box_completion bc
  WHERE bc.produccion_id = p_produccion_id AND bc.servicio = p_servicio;

  UPDATE placas pl SET numero_caja = ''
  WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio AND pl.numero_caja <> '';

  INSERT INTO service_boxes (
    produccion_id, servicio, numero_caja, tipo_servicio,
    consecutivo_inicial, consecutivo_final,
    serie_inicial, serie_final,
    cantidad_series, cantidad_placas, nombre_archivo,
    parcialidad, es_parcial
  )
  SELECT p_produccion_id, p_servicio, t.numero_caja, p_tipo_servicio,
         t.consecutivo_inicial, t.consecutivo_final,
         t.serie_inicial, t.serie_final,
         t.cantidad_series, t.cantidad_placas, 'Asignación por rango',
         1, t.consecutivo_final < v_max_consecutivo
  FROM service_box_plan_tmp t
  ORDER BY t.orden;

  UPDATE placas pl SET numero_caja = t.numero_caja
  FROM service_box_plan_tmp t
  WHERE pl.produccion_id = p_produccion_id AND pl.servicio = p_servicio
    AND pl.consecutivo BETWEEN v_inicio AND v_fin
    AND t.orden = (pl.consecutivo - v_inicio) / v_spb + 1;

  RETURN QUERY SELECT v_cajas, v_series_total, v_placas_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.replace_service_boxes_plan(uuid, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_service_boxes_plan(uuid, text, text, text, text, integer) TO authenticated;
