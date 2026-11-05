/*
# Add parcialidad tracking to service_boxes

1. Purpose
   Track box assignment parcialities per service. Each upload of boxes
   gets a consecutive parcialidad number (P1, P2, ...). If the last
   serie of the last box does not cover the last serie of the service,
   the parcialidad is marked as partial.

2. Changes
   - Add column `parcialidad` (integer, default 0) to service_boxes.
   - Add column `es_parcial` (boolean, default false) to service_boxes.
   - DROP and recreate `assign_service_boxes_by_series` with new return
     type (added parcialidad + es_parcial columns).
   - New function `get_service_parcialidad_info` returns summary.

3. Security
   - SECURITY DEFINER preserved on assign_service_boxes_by_series.
   - New function: REVOKE from PUBLIC/anon, GRANT to authenticated.
*/

ALTER TABLE service_boxes ADD COLUMN IF NOT EXISTS parcialidad integer NOT NULL DEFAULT 0;
ALTER TABLE service_boxes ADD COLUMN IF NOT EXISTS es_parcial boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.assign_service_boxes_by_series(uuid, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.assign_service_boxes_by_series(
  p_produccion_id uuid,
  p_servicio text,
  p_tipo_servicio text,
  p_boxes jsonb,
  p_nombre_archivo text DEFAULT ''
)
RETURNS TABLE(cajas integer, series integer, placas integer, parcialidad integer, es_parcial boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box jsonb;
  v_numero_caja text;
  v_serie_inicial text;
  v_serie_final text;
  v_inicio integer;
  v_fin integer;
  v_series integer;
  v_expected_plates integer;
  v_actual_plates integer;
  v_distinct_consecutivos integer;
  v_cajas integer := 0;
  v_series_total integer := 0;
  v_placas_total integer := 0;
  v_parcialidad integer := 0;
  v_es_parcial boolean := false;
  v_last_consecutivo_box integer;
  v_max_consecutivo_service integer;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF jsonb_typeof(p_boxes) <> 'array' OR jsonb_array_length(p_boxes) = 0 OR jsonb_array_length(p_boxes) > 500 THEN
    RAISE EXCEPTION 'El lote debe contener entre 1 y 500 cajas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM production_services
    WHERE produccion_id = p_produccion_id AND nombre = p_servicio AND tipo_servicio = p_tipo_servicio
  ) THEN
    RAISE EXCEPTION 'El servicio no está registrado con ese tipo';
  END IF;

  -- Compute next parcialidad number for this service
  SELECT COALESCE(MAX(parcialidad), 0) + 1 INTO v_parcialidad
  FROM service_boxes
  WHERE produccion_id = p_produccion_id AND servicio = p_servicio;

  FOR v_box IN SELECT value FROM jsonb_array_elements(p_boxes)
  LOOP
    v_numero_caja := btrim(v_box->>'numero_caja');
    v_serie_inicial := btrim(upper(v_box->>'serie_inicial'));
    v_serie_final := btrim(upper(v_box->>'serie_final'));

    IF v_numero_caja IS NULL OR v_numero_caja = '' OR v_serie_inicial IS NULL OR v_serie_inicial = '' OR v_serie_final IS NULL OR v_serie_final = '' THEN
      RAISE EXCEPTION 'Datos de caja inválidos: se requiere numero_caja, serie_inicial y serie_final';
    END IF;

    SELECT consecutivo INTO v_inicio
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND serie = v_serie_inicial
    LIMIT 1;

    IF v_inicio IS NULL THEN
      RAISE EXCEPTION 'La serie inicial % no existe en el servicio %', v_serie_inicial, p_servicio;
    END IF;

    SELECT consecutivo INTO v_fin
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND serie = v_serie_final
    LIMIT 1;

    IF v_fin IS NULL THEN
      RAISE EXCEPTION 'La serie final % no existe en el servicio %', v_serie_final, p_servicio;
    END IF;

    IF v_fin < v_inicio THEN
      RAISE EXCEPTION 'La serie final tiene un consecutivo menor que la serie inicial en la caja %', v_numero_caja;
    END IF;

    IF EXISTS (
      SELECT 1 FROM service_boxes existing
      WHERE existing.produccion_id = p_produccion_id AND existing.servicio = p_servicio
      AND existing.consecutivo_inicial <= v_fin AND v_inicio <= existing.consecutivo_final
    ) THEN
      RAISE EXCEPTION 'La caja % se superpone con una caja ya asignada', v_numero_caja;
    END IF;

    v_series := v_fin - v_inicio + 1;
    v_expected_plates := v_series * CASE WHEN p_tipo_servicio = 'JGS' THEN 2 ELSE 1 END;

    IF (v_box ? 'cantidad_series') AND (v_box->>'cantidad_series')::integer <> v_series THEN
      RAISE EXCEPTION 'La cantidad de series no coincide con el rango en la caja %', v_numero_caja;
    END IF;
    IF (v_box ? 'cantidad_placas') AND (v_box->>'cantidad_placas')::integer <> v_expected_plates THEN
      RAISE EXCEPTION 'La cantidad de placas no coincide con el rango y tipo de servicio en la caja %', v_numero_caja;
    END IF;

    SELECT count(*), count(DISTINCT consecutivo) INTO v_actual_plates, v_distinct_consecutivos
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;

    IF v_actual_plates <> v_expected_plates OR v_distinct_consecutivos <> v_series THEN
      RAISE EXCEPTION 'El rango de la caja % no coincide con las placas del servicio', v_numero_caja;
    END IF;

    INSERT INTO service_boxes (
      produccion_id, servicio, numero_caja, tipo_servicio,
      consecutivo_inicial, consecutivo_final,
      serie_inicial, serie_final,
      cantidad_series, cantidad_placas, nombre_archivo,
      parcialidad, es_parcial
    )
    VALUES (
      p_produccion_id, p_servicio, v_numero_caja, p_tipo_servicio,
      v_inicio, v_fin,
      v_serie_inicial, v_serie_final,
      v_series, v_expected_plates, COALESCE(p_nombre_archivo, ''),
      v_parcialidad, false
    );

    UPDATE placas SET numero_caja = v_numero_caja
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;

    v_cajas := v_cajas + 1;
    v_series_total := v_series_total + v_series;
    v_placas_total := v_placas_total + v_expected_plates;
    v_last_consecutivo_box := v_fin;
  END LOOP;

  -- Determine if this parcialidad is partial
  SELECT MAX(consecutivo) INTO v_max_consecutivo_service
  FROM placas
  WHERE produccion_id = p_produccion_id AND servicio = p_servicio;

  IF v_max_consecutivo_service IS NOT NULL AND v_last_consecutivo_box < v_max_consecutivo_service THEN
    v_es_parcial := true;
    UPDATE service_boxes SET es_parcial = true
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND parcialidad = v_parcialidad;
  END IF;

  RETURN QUERY SELECT v_cajas, v_series_total, v_placas_total, v_parcialidad, v_es_parcial;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_service_boxes_by_series(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_service_boxes_by_series(uuid, text, text, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_service_parcialidad_info(
  p_produccion_id uuid,
  p_servicio text
)
RETURNS TABLE (
  total_parcialidades integer,
  total_cajas_asignadas integer,
  total_placas_asignadas bigint,
  total_placas_servicio bigint,
  placas_faltantes bigint,
  cajas_faltantes_estimadas integer,
  es_completo boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH service_totals AS (
    SELECT count(*) AS total_placas, count(DISTINCT consecutivo) AS total_series
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio
  ),
  box_totals AS (
    SELECT
      count(DISTINCT parcialidad) AS total_parcialidades,
      count(*) AS total_cajas,
      COALESCE(sum(cantidad_placas), 0) AS total_placas_asignadas
    FROM service_boxes
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio
  )
  SELECT
    COALESCE(bt.total_parcialidades, 0)::integer,
    COALESCE(bt.total_cajas, 0)::integer,
    COALESCE(bt.total_placas_asignadas, 0),
    st.total_placas,
    GREATEST(st.total_placas - COALESCE(bt.total_placas_asignadas, 0), 0),
    CASE
      WHEN st.total_placas = 0 THEN 0
      WHEN COALESCE(bt.total_placas_asignadas, 0) = 0 THEN 0
      ELSE CEIL(GREATEST(st.total_placas - COALESCE(bt.total_placas_asignadas, 0), 0)::numeric /
        (COALESCE(bt.total_placas_asignadas, 0)::numeric / NULLIF(bt.total_cajas, 0)))
    END::integer,
    COALESCE(bt.total_placas_asignadas, 0) >= st.total_placas
  FROM service_totals st
  LEFT JOIN box_totals bt ON true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_service_parcialidad_info(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_parcialidad_info(uuid, text) TO authenticated;
