DROP FUNCTION IF EXISTS public.assign_service_boxes_by_series(uuid, text, text, jsonb, text, boolean);

CREATE OR REPLACE FUNCTION public.reset_service_box_assignments(
  p_produccion_id uuid,
  p_servicio text,
  p_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_limit < 1 OR p_limit > 50000 THEN
    RAISE EXCEPTION 'El límite de placas por lote debe estar entre 1 y 50000';
  END IF;

  DELETE FROM service_boxes WHERE produccion_id = p_produccion_id AND servicio = p_servicio;

  WITH target AS (
    SELECT id FROM placas
    WHERE produccion_id = p_produccion_id
      AND servicio = p_servicio
      AND numero_caja IS DISTINCT FROM 'INDEFINIDA'
    LIMIT p_limit
  )
  UPDATE placas p
  SET numero_caja = 'INDEFINIDA'
  FROM target
  WHERE p.id = target.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_service_boxes_by_series(
  p_produccion_id uuid,
  p_servicio text,
  p_tipo_servicio text,
  p_boxes jsonb,
  p_nombre_archivo text DEFAULT ''
)
RETURNS TABLE(cajas integer, series integer, placas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      cantidad_series, cantidad_placas, nombre_archivo
    )
    VALUES (
      p_produccion_id, p_servicio, v_numero_caja, p_tipo_servicio,
      v_inicio, v_fin,
      v_serie_inicial, v_serie_final,
      v_series, v_expected_plates, COALESCE(p_nombre_archivo, '')
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

REVOKE EXECUTE ON FUNCTION public.reset_service_box_assignments(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_service_box_assignments(uuid, text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.assign_service_boxes_by_series(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_service_boxes_by_series(uuid, text, text, jsonb, text) TO authenticated;
