/*
# Fix numeric ordering in get_box_metrics

Same alphabetical-sort bug as get_service_box_page: ORDER BY sb.numero_caja
sorts as text (1, 10, 100, 2) instead of numerically (1, 2, 10, 100).
*/

CREATE OR REPLACE FUNCTION public.get_box_metrics(p_produccion_id uuid)
RETURNS TABLE(
  key text, servicio text, numero_caja text, placas bigint,
  placas_afectadas bigint, placas_con_pendientes bigint,
  reoperaciones bigint, pendientes bigint, recuperaciones bigint,
  estado text, completada_manual boolean, completada_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH box_reops AS (
  SELECT p.servicio, p.numero_caja,
    count(r.id) AS reops,
    count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend,
    count(DISTINCT r.placa_id) AS placas_afectadas,
    count(DISTINCT r.placa_id) FILTER (WHERE r.estado = 'pendiente') AS placas_con_pendientes
  FROM placas p
  JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
  WHERE p.produccion_id = p_produccion_id
  GROUP BY p.servicio, p.numero_caja
),
box_recups AS (
  SELECT p.servicio, p.numero_caja, count(c.id) AS recups
  FROM placas p
  JOIN recuperaciones c ON c.produccion_id = p.produccion_id AND c.placa_id = p.id
  WHERE p.produccion_id = p_produccion_id
  GROUP BY p.servicio, p.numero_caja
)
SELECT
  sb.servicio || '|' || sb.numero_caja,
  sb.servicio,
  sb.numero_caja,
  COALESCE(sb.cantidad_placas, 0)::bigint,
  COALESCE(br.placas_afectadas, 0)::bigint,
  COALESCE(br.placas_con_pendientes, 0)::bigint,
  COALESCE(br.reops, 0)::bigint,
  COALESCE(br.pend, 0)::bigint,
  COALESCE(bcr.recups, 0)::bigint,
  CASE
    WHEN COALESCE(br.pend, 0) > 0 THEN 'con_reoperaciones'
    WHEN COALESCE(br.reops, 0) > 0 THEN 'completada_ro'
    WHEN COALESCE(bc.completada_manual, false) THEN 'completada'
    ELSE 'en_proceso'
  END,
  COALESCE(bc.completada_manual, false),
  bc.completada_at
FROM service_boxes sb
LEFT JOIN box_reops br ON br.servicio = sb.servicio AND br.numero_caja = sb.numero_caja
LEFT JOIN box_recups bcr ON bcr.servicio = sb.servicio AND bcr.numero_caja = sb.numero_caja
LEFT JOIN box_completion bc ON bc.produccion_id = sb.produccion_id
  AND bc.servicio = sb.servicio AND bc.numero_caja = sb.numero_caja
WHERE sb.produccion_id = p_produccion_id
ORDER BY
  sb.servicio,
  CASE WHEN sb.numero_caja ~ '^[0-9]+$' THEN sb.numero_caja::bigint ELSE NULL END,
  sb.numero_caja;
$function$;

GRANT EXECUTE ON FUNCTION public.get_box_metrics(uuid) TO authenticated;
