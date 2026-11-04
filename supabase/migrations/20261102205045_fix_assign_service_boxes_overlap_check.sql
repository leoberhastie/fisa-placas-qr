/*
# Fix overlap validation in assign_service_boxes

1. Changes
- The overlap check between box ranges used a column list together with WITH ORDINALITY, which PostgreSQL rejects. Every box assignment failed before reaching the data.
- The check now iterates the boxes with jsonb_array_elements WITH ORDINALITY and compares ranges pairwise.
- No other behavior changes: admin only, registered service type must match, plate counts and consecutive coverage are verified, and the operation is atomic.

2. Security
- Unchanged: SECURITY DEFINER with fixed search_path, EXECUTE granted only to authenticated.
*/

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
    FROM jsonb_array_elements(p_boxes) WITH ORDINALITY AS a(v, ord)
    JOIN jsonb_array_elements(p_boxes) WITH ORDINALITY AS b(v, ord2)
      ON a.ord < b.ord2
      AND (a.v->>'consecutivo_inicial')::integer <= (b.v->>'consecutivo_final')::integer
      AND (b.v->>'consecutivo_inicial')::integer <= (a.v->>'consecutivo_final')::integer
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
