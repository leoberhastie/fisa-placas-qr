/*
# Box Import by Series (replaces consecutivo-based import)

## Purpose
The Excel files for box assignment contain **serie inicial** and **serie final** (plate serial numbers),
NOT consecutivo numbers. This migration adds the infrastructure to resolve series to consecutivos
server-side and assign boxes by serie ranges, while keeping full backward compatibility.

## Changes

### 1. New columns on `service_boxes`
- `serie_inicial` text — starting plate serie for the box
- `serie_final` text — ending plate serie for the box
Both nullable for backward compat with existing rows that only have consecutivo ranges.

### 2. New index on `placas` for serie lookups per service
- `placas_produccion_servicio_serie_idx` on `(produccion_id, servicio, serie)`
  Speeds up resolving serie → consecutivo during import.

### 3. New function: `preview_box_series_mapping(p_produccion_id, p_servicio, p_boxes)`
Returns a preview of how each row's serie_inicial/serie_final maps to consecutivo ranges.
For each input row, returns:
- numero_caja
- serie_inicial, serie_final (as sent)
- consecutivo_inicial, consecutivo_final (resolved from placas)
- series_count (consecutivo_final - consecutivo_inicial + 1)
- found_inicial (boolean), found_final (boolean)
- error (text — 'serie_inicial_no_encontrada', 'serie_final_no_encontrada', 'rango_invertido', or null)

### 4. New function: `assign_service_boxes_by_series(p_produccion_id, p_servicio, p_tipo_servicio, p_boxes, p_nombre_archivo, p_replace_existing)`
Same structure as `assign_service_boxes_batch` but receives serie_inicial/serie_final and
resolves them to consecutivos internally before assigning. Stores both serie and consecutivo
ranges in `service_boxes`.

### 5. New function: `count_uncovered_box_series_by_series(p_produccion_id, p_servicio, p_boxes)`
Replaces `count_uncovered_box_series` for the serie-based flow. Counts how many series
in the requested ranges don't exist in the placas table for that service.

### 6. Security
- All new functions are SECURITY DEFINER, search_path = public.
- `preview_box_series_mapping` and `count_uncovered_box_series_by_series` are STABLE read-only
  functions granted to authenticated (admin/gerente/operador can preview).
- `assign_service_boxes_by_series` is admin-only (checks current_user_role()).
- EXECUTE revoked from PUBLIC/anon on all three functions.
*/

-- 1. Add serie columns to service_boxes
ALTER TABLE service_boxes
  ADD COLUMN IF NOT EXISTS serie_inicial text,
  ADD COLUMN IF NOT EXISTS serie_final text;

-- 2. Index for serie lookups per production+service
CREATE INDEX IF NOT EXISTS placas_produccion_servicio_serie_idx
  ON placas (produccion_id, servicio, serie);

-- 3. Preview function: resolves series to consecutivos without writing anything
CREATE OR REPLACE FUNCTION public.preview_box_series_mapping(
  p_produccion_id uuid,
  p_servicio text,
  p_boxes jsonb
)
RETURNS TABLE(
  row_index integer,
  numero_caja text,
  serie_inicial text,
  serie_final text,
  consecutivo_inicial integer,
  consecutivo_final integer,
  series_count integer,
  found_inicial boolean,
  found_final boolean,
  error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH input AS (
    SELECT
      (obj->>'row_index')::integer AS row_index,
      btrim(obj->>'numero_caja') AS numero_caja,
      btrim(upper(obj->>'serie_inicial')) AS serie_inicial,
      btrim(upper(obj->>'serie_final')) AS serie_final
    FROM jsonb_array_elements(p_boxes) AS obj
  ),
  resolved AS (
    SELECT
      i.row_index,
      i.numero_caja,
      i.serie_inicial,
      i.serie_final,
      p_ini.consecutivo AS consecutivo_inicial,
      p_fin.consecutivo AS consecutivo_final,
      (p_ini.consecutivo IS NOT NULL) AS found_inicial,
      (p_fin.consecutivo IS NOT NULL) AS found_final
    FROM input i
    LEFT JOIN LATERAL (
      SELECT consecutivo FROM placas
      WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND serie = i.serie_inicial
      LIMIT 1
    ) p_ini ON true
    LEFT JOIN LATERAL (
      SELECT consecutivo FROM placas
      WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND serie = i.serie_final
      LIMIT 1
    ) p_fin ON true
  )
  SELECT
    r.row_index,
    r.numero_caja,
    r.serie_inicial,
    r.serie_final,
    r.consecutivo_inicial,
    r.consecutivo_final,
    CASE
      WHEN r.consecutivo_inicial IS NOT NULL AND r.consecutivo_final IS NOT NULL
        AND r.consecutivo_final >= r.consecutivo_inicial
      THEN r.consecutivo_final - r.consecutivo_inicial + 1
      ELSE 0
    END AS series_count,
    r.found_inicial,
    r.found_final,
    CASE
      WHEN NOT r.found_inicial THEN 'serie_inicial_no_encontrada'
      WHEN NOT r.found_final THEN 'serie_final_no_encontrada'
      WHEN r.consecutivo_final < r.consecutivo_inicial THEN 'rango_invertido'
      ELSE NULL
    END AS error
  FROM resolved r
  ORDER BY r.row_index;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_box_series_mapping(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_box_series_mapping(uuid, text, jsonb) TO authenticated;

-- 4. Count uncovered series (serie-based version)
CREATE OR REPLACE FUNCTION public.count_uncovered_box_series_by_series(
  p_produccion_id uuid,
  p_servicio text,
  p_boxes jsonb
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH input AS (
    SELECT
      btrim(upper(obj->>'serie_inicial')) AS serie_inicial,
      btrim(upper(obj->>'serie_final')) AS serie_final
    FROM jsonb_array_elements(p_boxes) AS obj
  ),
  resolved AS (
    SELECT
      i.serie_inicial,
      i.serie_final,
      p_ini.consecutivo AS consecutivo_inicial,
      p_fin.consecutivo AS consecutivo_final
    FROM input i
    LEFT JOIN LATERAL (
      SELECT consecutivo FROM placas
      WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND serie = i.serie_inicial
      LIMIT 1
    ) p_ini ON true
    LEFT JOIN LATERAL (
      SELECT consecutivo FROM placas
      WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND serie = i.serie_final
      LIMIT 1
    ) p_fin ON true
  ),
  requested AS (
    SELECT DISTINCT g.consecutivo
    FROM resolved r
    CROSS JOIN LATERAL generate_series(r.consecutivo_inicial, r.consecutivo_final) AS g(consecutivo)
    WHERE r.consecutivo_inicial IS NOT NULL AND r.consecutivo_final IS NOT NULL
  )
  SELECT count(*)
  FROM requested req
  WHERE NOT EXISTS (
    SELECT 1 FROM placas p
    WHERE p.produccion_id = p_produccion_id AND p.servicio = p_servicio AND p.consecutivo = req.consecutivo
  );
$$;

REVOKE EXECUTE ON FUNCTION public.count_uncovered_box_series_by_series(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_uncovered_box_series_by_series(uuid, text, jsonb) TO authenticated;

-- 5. Assign function: serie-based version
CREATE OR REPLACE FUNCTION public.assign_service_boxes_by_series(
  p_produccion_id uuid,
  p_servicio text,
  p_tipo_servicio text,
  p_boxes jsonb,
  p_nombre_archivo text DEFAULT '',
  p_replace_existing boolean DEFAULT true
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

  IF jsonb_typeof(p_boxes) <> 'array' OR jsonb_array_length(p_boxes) = 0 OR jsonb_array_length(p_boxes) > 5000 THEN
    RAISE EXCEPTION 'El lote debe contener entre 1 y 5000 cajas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM production_services
    WHERE produccion_id = p_produccion_id AND nombre = p_servicio AND tipo_servicio = p_tipo_servicio
  ) THEN
    RAISE EXCEPTION 'El servicio no está registrado con ese tipo';
  END IF;

  IF p_replace_existing THEN
    DELETE FROM service_boxes WHERE produccion_id = p_produccion_id AND servicio = p_servicio;
    UPDATE placas SET numero_caja = 'INDEFINIDA'
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio;
  END IF;

  FOR v_box IN SELECT value FROM jsonb_array_elements(p_boxes)
  LOOP
    v_numero_caja := btrim(v_box->>'numero_caja');
    v_serie_inicial := btrim(upper(v_box->>'serie_inicial'));
    v_serie_final := btrim(upper(v_box->>'serie_final'));

    IF v_numero_caja IS NULL OR v_numero_caja = '' OR v_serie_inicial IS NULL OR v_serie_inicial = '' OR v_serie_final IS NULL OR v_serie_final = '' THEN
      RAISE EXCEPTION 'Datos de caja inválidos: se requiere numero_caja, serie_inicial y serie_final';
    END IF;

    -- Resolve serie_inicial to consecutivo
    SELECT consecutivo INTO v_inicio
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND serie = v_serie_inicial
    LIMIT 1;

    IF v_inicio IS NULL THEN
      RAISE EXCEPTION 'La serie inicial % no existe en el servicio %', v_serie_inicial, p_servicio;
    END IF;

    -- Resolve serie_final to consecutivo
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

    -- Check overlap with existing boxes
    IF EXISTS (
      SELECT 1 FROM service_boxes existing
      WHERE existing.produccion_id = p_produccion_id AND existing.servicio = p_servicio
      AND existing.consecutivo_inicial <= v_fin AND v_inicio <= existing.consecutivo_final
    ) THEN
      RAISE EXCEPTION 'La caja % se superpone con una caja ya asignada', v_numero_caja;
    END IF;

    v_series := v_fin - v_inicio + 1;
    v_expected_plates := v_series * CASE WHEN p_tipo_servicio = 'JGS' THEN 2 ELSE 1 END;

    -- Optional quantity validation
    IF (v_box ? 'cantidad_series') AND (v_box->>'cantidad_series')::integer <> v_series THEN
      RAISE EXCEPTION 'La cantidad de series no coincide con el rango en la caja %', v_numero_caja;
    END IF;
    IF (v_box ? 'cantidad_placas') AND (v_box->>'cantidad_placas')::integer <> v_expected_plates THEN
      RAISE EXCEPTION 'La cantidad de placas no coincide con el rango y tipo de servicio en la caja %', v_numero_caja;
    END IF;

    -- Verify actual plates exist in the consecutivo range
    SELECT count(*), count(DISTINCT consecutivo) INTO v_actual_plates, v_distinct_consecutivos
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;

    IF v_actual_plates <> v_expected_plates OR v_distinct_consecutivos <> v_series THEN
      RAISE EXCEPTION 'El rango de la caja % no coincide con las placas del servicio', v_numero_caja;
    END IF;

    -- Insert service_boxes record with both serie and consecutivo ranges
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

    -- Assign box to plates
    UPDATE placas SET numero_caja = v_numero_caja
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND consecutivo BETWEEN v_inicio AND v_fin;

    v_cajas := v_cajas + 1;
    v_series_total := v_series_total + v_series;
    v_placas_total := v_placas_total + v_expected_plates;
  END LOOP;

  RETURN QUERY SELECT v_cajas, v_series_total, v_placas_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_service_boxes_by_series(uuid, text, text, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_service_boxes_by_series(uuid, text, text, jsonb, text, boolean) TO authenticated;
