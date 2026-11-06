/*
# Add reoperation count per box to list_service_boxes

1. Purpose
   The batch reoperation picker highlights boxes that already have reoperations.
   This adds a `placas_reoperadas` column to list_service_boxes with the number
   of plates in each box that have at least one reoperation.

2. Changes
   - list_service_boxes now returns (numero_caja, placas, placas_reoperadas).
   - Boxes that are completed remain excluded, as before.
   - Ordering is unchanged.

3. Security
   - SECURITY INVOKER preserved.
   - EXECUTE revoked from PUBLIC/anon and granted to authenticated again
     (dropping the function removes its previous grants).
*/

DROP FUNCTION IF EXISTS public.list_service_boxes(uuid, text);

CREATE OR REPLACE FUNCTION public.list_service_boxes(p_produccion_id uuid, p_servicio text)
RETURNS TABLE (numero_caja text, placas bigint, placas_reoperadas bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.numero_caja,
    count(*)::bigint AS placas,
    count(*) FILTER (
      WHERE EXISTS (SELECT 1 FROM reoperaciones r WHERE r.placa_id = p.id)
    )::bigint AS placas_reoperadas
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
