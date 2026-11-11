/*
# List all plates with repeated reoperations

1. Purpose
- Add a read-only RPC for the Reports screen.
- Return every plate with more than one reoperation in the selected production.

2. New function
- `list_placas_con_mas_reoperaciones(p_produccion_id)` returns series, position, service, box, total reoperations, and pending reoperations.
- Results are ordered from highest to lowest reoperations and then by series.

3. Security
- The function runs as SECURITY INVOKER with a fixed public search path.
- Anonymous execution is revoked; authenticated staff may execute it.
- No tables, columns, rows, RLS policies, or grants on tables are changed.

4. Data safety
- This is a read-only query and does not modify operational data.
*/

CREATE OR REPLACE FUNCTION public.list_placas_con_mas_reoperaciones(p_produccion_id uuid)
RETURNS TABLE (
  serie text,
  posicion text,
  servicio text,
  caja text,
  reoperaciones bigint,
  pendientes bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT
    p.serie,
    p.posicion,
    COALESCE(p.servicio, 'Sin servicio') AS servicio,
    COALESCE(p.numero_caja, '—') AS caja,
    count(r.id) AS reoperaciones,
    count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pendientes
  FROM placas p
  JOIN reoperaciones r
    ON r.produccion_id = p.produccion_id
   AND r.placa_id = p.id
  WHERE p.produccion_id = p_produccion_id
  GROUP BY p.id, p.serie, p.posicion, p.servicio, p.numero_caja
  HAVING count(r.id) > 1
  ORDER BY count(r.id) DESC, p.serie;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_placas_con_mas_reoperaciones(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_placas_con_mas_reoperaciones(uuid) TO authenticated;