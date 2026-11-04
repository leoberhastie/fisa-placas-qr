/*
# Allow get_service_box_page to span all services

p_servicio NULL means every service in the production. Results are ordered
by service, then numerically by box number.
*/

CREATE OR REPLACE FUNCTION public.get_service_box_page(
  p_produccion_id uuid,
  p_servicio text,
  p_estado text DEFAULT 'todos',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  key text,
  servicio text,
  numero_caja text,
  placas bigint,
  serie_inicial text,
  serie_final text,
  cantidad_series integer,
  placas_afectadas bigint,
  placas_con_pendientes bigint,
  reoperaciones bigint,
  pendientes bigint,
  recuperaciones bigint,
  estado text,
  completada_manual boolean,
  completada_at timestamptz,
  total_count bigint
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
),
all_boxes AS (
  SELECT
    sb.servicio || '|' || sb.numero_caja AS key,
    sb.servicio,
    sb.numero_caja,
    COALESCE(sb.cantidad_placas, 0)::bigint AS placas,
    sb.serie_inicial,
    sb.serie_final,
    COALESCE(sb.cantidad_series, 0) AS cantidad_series,
    COALESCE(br.placas_afectadas, 0)::bigint AS placas_afectadas,
    COALESCE(br.placas_con_pendientes, 0)::bigint AS placas_con_pendientes,
    COALESCE(br.reops, 0)::bigint AS reoperaciones,
    COALESCE(br.pend, 0)::bigint AS pendientes,
    COALESCE(bcr.recups, 0)::bigint AS recuperaciones,
    CASE
      WHEN COALESCE(br.pend, 0) > 0 THEN 'con_reoperaciones'
      WHEN COALESCE(br.reops, 0) > 0 THEN 'completada_ro'
      WHEN COALESCE(bc.completada_manual, false) THEN 'completada'
      ELSE 'en_proceso'
    END AS estado,
    COALESCE(bc.completada_manual, false) AS completada_manual,
    bc.completada_at,
    CASE WHEN sb.numero_caja ~ '^[0-9]+$' THEN sb.numero_caja::bigint ELSE NULL END AS sort_num
  FROM service_boxes sb
  LEFT JOIN box_reops br ON br.servicio = sb.servicio AND br.numero_caja = sb.numero_caja
  LEFT JOIN box_recups bcr ON bcr.servicio = sb.servicio AND bcr.numero_caja = sb.numero_caja
  LEFT JOIN box_completion bc ON bc.produccion_id = sb.produccion_id
    AND bc.servicio = sb.servicio AND bc.numero_caja = sb.numero_caja
  WHERE sb.produccion_id = p_produccion_id
    AND (p_servicio IS NULL OR sb.servicio = p_servicio)
),
filtered AS (
  SELECT * FROM all_boxes
  WHERE (p_estado = 'todos' OR estado = p_estado)
    AND (p_search IS NULL OR p_search = '' OR numero_caja = p_search)
),
total AS (
  SELECT count(*) AS cnt FROM filtered
)
SELECT
  f.key, f.servicio, f.numero_caja, f.placas, f.serie_inicial, f.serie_final,
  f.cantidad_series, f.placas_afectadas, f.placas_con_pendientes,
  f.reoperaciones, f.pendientes, f.recuperaciones,
  f.estado, f.completada_manual, f.completada_at,
  t.cnt AS total_count
FROM filtered f
CROSS JOIN total t
ORDER BY f.servicio, f.sort_num, f.numero_caja
LIMIT GREATEST(p_page_size, 1)
OFFSET GREATEST((p_page - 1) * p_page_size, 0);
$function$;

GRANT EXECUTE ON FUNCTION public.get_service_box_page(uuid, text, text, integer, integer, text) TO authenticated;
