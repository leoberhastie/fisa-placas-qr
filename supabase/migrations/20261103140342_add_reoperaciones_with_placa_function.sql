/*
# Add reoperations with placa info function

1. Purpose
- ReoperationsPage builds a placaMap from ALL placas (787k rows) just to show serie/posicion/servicio/caja next to each reoperation.
- This function returns reoperaciones already joined with placa info, so the page no longer needs to load any placas.

2. New function
- `list_reoperaciones_with_placa(p_produccion_id)`: returns reoperaciones with serie, posicion, servicio, numero_caja joined from placas. Only returns the reoperaciones for this production (typically a few hundred to a few thousand), not the placas.

3. Security
- SECURITY INVOKER: existing RLS policies apply.
- EXECUTE revoked from PUBLIC and anon, granted to authenticated.

4. Data safety
- No tables, columns, or rows are changed. Read-only function.
*/

CREATE OR REPLACE FUNCTION public.list_reoperaciones_with_placa(p_produccion_id uuid)
RETURNS TABLE (
  id uuid,
  produccion_id uuid,
  placa_id uuid,
  proceso text,
  fecha_hora timestamptz,
  operador text,
  usuario text,
  estado text,
  observaciones text,
  serie text,
  posicion text,
  servicio text,
  numero_caja text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT r.id, r.produccion_id, r.placa_id, r.proceso, r.fecha_hora, r.operador,
         r.usuario, r.estado, r.observaciones,
         COALESCE(p.serie, '—') AS serie,
         COALESCE(p.posicion, '—') AS posicion,
         COALESCE(p.servicio, '—') AS servicio,
         COALESCE(p.numero_caja, '—') AS numero_caja
  FROM reoperaciones r
  LEFT JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  WHERE r.produccion_id = p_produccion_id
  ORDER BY r.fecha_hora DESC, r.id ASC;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_reoperaciones_with_placa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_reoperaciones_with_placa(uuid) TO authenticated;
