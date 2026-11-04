/*
# Add service summary and box coverage functions

1. Purpose
- Give the box import screen fast, server-side counts instead of downloading every plate.
- A production can hold hundreds of thousands of plates, so counting in the database is the only practical way to show services quickly.

2. New functions
- `get_service_summaries(p_produccion_id)`: one row per registered service with its type, series count, physical plate count and box count.
- `count_uncovered_box_series(p_produccion_id, p_servicio, p_boxes)`: returns how many series inside the requested box ranges do not exist as plates of that service. Used as a preview before saving boxes.

3. Security
- Both functions run as the caller (SECURITY INVOKER), so the existing row policies still apply.
- EXECUTE is revoked from PUBLIC and anon and granted only to authenticated.

4. Data safety
- No tables, columns or existing rows are changed.
*/

CREATE OR REPLACE FUNCTION public.get_service_summaries(p_produccion_id uuid)
RETURNS TABLE (servicio text, tipo_servicio text, series bigint, placas bigint, cajas bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH plate_counts AS (
    SELECT p.servicio, count(*) AS placas, count(DISTINCT p.consecutivo) AS series
    FROM placas p
    WHERE p.produccion_id = p_produccion_id
    GROUP BY p.servicio
  ),
  box_counts AS (
    SELECT b.servicio, count(*) AS cajas
    FROM service_boxes b
    WHERE b.produccion_id = p_produccion_id
    GROUP BY b.servicio
  )
  SELECT ps.nombre, ps.tipo_servicio, COALESCE(pc.series, 0), COALESCE(pc.placas, 0), COALESCE(bc.cajas, 0)
  FROM production_services ps
  LEFT JOIN plate_counts pc ON pc.servicio = ps.nombre
  LEFT JOIN box_counts bc ON bc.servicio = ps.nombre
  WHERE ps.produccion_id = p_produccion_id
  ORDER BY ps.nombre;
$function$;

CREATE OR REPLACE FUNCTION public.count_uncovered_box_series(p_produccion_id uuid, p_servicio text, p_boxes jsonb)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH requested AS (
    SELECT DISTINCT g.consecutivo
    FROM jsonb_to_recordset(p_boxes) AS b(consecutivo_inicial integer, consecutivo_final integer)
    CROSS JOIN LATERAL generate_series(b.consecutivo_inicial, b.consecutivo_final) AS g(consecutivo)
  )
  SELECT count(*)
  FROM requested r
  WHERE NOT EXISTS (
    SELECT 1 FROM placas p
    WHERE p.produccion_id = p_produccion_id AND p.servicio = p_servicio AND p.consecutivo = r.consecutivo
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_service_summaries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_summaries(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.count_uncovered_box_series(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_uncovered_box_series(uuid, text, jsonb) TO authenticated;
