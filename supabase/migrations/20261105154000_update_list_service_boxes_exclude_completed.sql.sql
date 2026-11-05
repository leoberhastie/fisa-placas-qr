/*
# Update list_service_boxes to exclude completed boxes

1. Purpose
   The batch reoperation panel should only show boxes that are NOT completed.
   This modifies list_service_boxes to LEFT JOIN box_completion and exclude
   any caja that has a completion record.

2. Security
   - SECURITY INVOKER preserved. RLS on both placas and box_completion
     allows authenticated SELECT.
   - EXECUTE revoked from PUBLIC/anon, granted to authenticated.
*/

DROP FUNCTION IF EXISTS public.list_service_boxes(uuid, text);

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
    AND NOT EXISTS (
      SELECT 1 FROM box_completion bc
      WHERE bc.produccion_id = p.produccion_id
        AND bc.servicio = p.servicio
        AND bc.numero_caja = p.numero_caja
    )
  GROUP BY p.numero_caja
  ORDER BY
    CASE WHEN p.numero_caja ~ '^[0-9]+$' THEN p.numero_caja::bigint END NULLS LAST,
    p.numero_caja;
$$;

REVOKE EXECUTE ON FUNCTION public.list_service_boxes(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_service_boxes(uuid, text) TO authenticated;
