/*
# Add list_service_boxes function

1. New function
- `list_service_boxes(p_produccion_id, p_servicio)` returns the distinct boxes (cajas) that belong to one service in one production, with the number of plates in each box.
- Boxes are sorted numerically when their number is numeric, so the list reads 1, 2, 10 instead of 1, 10, 2.

2. Security
- Runs as the caller (SECURITY INVOKER), so the existing row level security on `placas` still applies.
- Execute permission is removed from PUBLIC and anon, and granted only to authenticated users.

3. Notes
- Read-only. No data is changed.
*/

CREATE OR REPLACE FUNCTION public.list_service_boxes(p_produccion_id uuid, p_servicio text)
RETURNS TABLE (numero_caja text, placas bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.numero_caja, count(*)::bigint AS placas
  FROM placas p
  WHERE p.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
  GROUP BY p.numero_caja
  ORDER BY
    CASE WHEN p.numero_caja ~ '^[0-9]+$' THEN p.numero_caja::bigint END NULLS LAST,
    p.numero_caja;
$$;

REVOKE EXECUTE ON FUNCTION public.list_service_boxes(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_service_boxes(uuid, text) TO authenticated;
