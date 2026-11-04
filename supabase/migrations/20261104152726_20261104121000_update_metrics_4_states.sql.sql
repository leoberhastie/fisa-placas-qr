/*
# Update box/service/production metrics for 4-state model

## Purpose
Replace the old 3-state model with the new 4-state model in all three metrics
functions. get_box_metrics now returns ALL boxes (~3,905 rows from service_boxes)
instead of only boxes with reoperations, and uses service_boxes.cantidad_placas
instead of counting 786,900 placas rows.

## 4 box states
  1. con_reoperaciones  — has pending reoperations
  2. completada_ro      — had reoperations, all resolved (automatic)
  3. completada         — manually marked, never had reoperations
  4. en_proceso         — no reoperations, not manually completed

## Service state (priority)
  1. con_reoperaciones  — any box has con_reoperaciones
  2. en_proceso         — any box is en_proceso
  3. completada         — all boxes are completed (manual or RO)

## Changes
- get_box_metrics: DROP + CREATE with new columns (completada_manual, completada_at)
- get_service_metrics: DROP + CREATE with new columns (cajas_en_proceso, cajas_completadas_ro)
- get_production_metrics: CREATE OR REPLACE with new counters
*/

DROP FUNCTION IF EXISTS public.get_box_metrics(uuid);
DROP FUNCTION IF EXISTS public.get_service_metrics(uuid);

-- ============================================================
-- get_box_metrics: all boxes, 4 states
-- ============================================================
CREATE FUNCTION public.get_box_metrics(p_produccion_id uuid)
RETURNS TABLE(
  key text,
  servicio text,
  numero_caja text,
  placas bigint,
  placas_afectadas bigint,
  placas_con_pendientes bigint,
  reoperaciones bigint,
  pendientes bigint,
  recuperaciones bigint,
  estado text,
  completada_manual boolean,
  completada_at timestamptz
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
ORDER BY sb.servicio, sb.numero_caja;
$function$;

GRANT EXECUTE ON FUNCTION public.get_box_metrics(uuid) TO authenticated;

-- ============================================================
-- get_service_metrics: 4 states, priority rule
-- ============================================================
CREATE FUNCTION public.get_service_metrics(p_produccion_id uuid)
RETURNS TABLE(
  servicio text,
  tipo_servicio text,
  series bigint,
  placas bigint,
  cajas bigint,
  cajas_con_reoperaciones bigint,
  cajas_pendientes bigint,
  cajas_completas bigint,
  cajas_en_proceso bigint,
  cajas_completadas_ro bigint,
  placas_afectadas bigint,
  reoperaciones bigint,
  pendientes bigint,
  recuperaciones bigint,
  porcentaje_recuperacion numeric,
  estado text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH plate_counts AS (
  SELECT p.servicio, count(*) AS placas
  FROM placas p
  WHERE p.produccion_id = p_produccion_id
  GROUP BY p.servicio
),
box_totals AS (
  SELECT sb.servicio, count(*) AS cajas
  FROM service_boxes sb
  WHERE sb.produccion_id = p_produccion_id
  GROUP BY sb.servicio
),
reop_by_service AS (
  SELECT p.servicio,
    count(r.id) AS reops,
    count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend,
    count(DISTINCT r.placa_id) AS placas_afectadas
  FROM reoperaciones r
  JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  WHERE r.produccion_id = p_produccion_id
  GROUP BY p.servicio
),
recup_by_service AS (
  SELECT p.servicio, count(c.id) AS recups
  FROM recuperaciones c
  JOIN placas p ON p.id = c.placa_id AND p.produccion_id = c.produccion_id
  WHERE c.produccion_id = p_produccion_id
  GROUP BY p.servicio
),
box_estado AS (
  SELECT sb.servicio,
    COALESCE(br.pend, 0) AS pend,
    COALESCE(br.reops, 0) AS reops,
    COALESCE(bc.completada_manual, false) AS manual
  FROM service_boxes sb
  LEFT JOIN (
    SELECT p.servicio, p.numero_caja,
      count(r.id) AS reops,
      count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM placas p
    JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
    WHERE p.produccion_id = p_produccion_id
    GROUP BY p.servicio, p.numero_caja
  ) br ON br.servicio = sb.servicio AND br.numero_caja = sb.numero_caja
  LEFT JOIN box_completion bc ON bc.produccion_id = sb.produccion_id
    AND bc.servicio = sb.servicio AND bc.numero_caja = sb.numero_caja
  WHERE sb.produccion_id = p_produccion_id
),
box_counts AS (
  SELECT servicio,
    count(*) FILTER (WHERE pend > 0) AS cajas_con_reops,
    count(*) FILTER (WHERE pend = 0 AND reops = 0 AND manual = false) AS cajas_en_proceso,
    count(*) FILTER (WHERE reops > 0 AND pend = 0) AS cajas_completas_ro,
    count(*) FILTER (WHERE manual = true AND reops = 0) AS cajas_completadas_manual
  FROM box_estado
  GROUP BY servicio
)
SELECT
  ps.nombre,
  ps.tipo_servicio,
  CASE WHEN ps.tipo_servicio = 'JGS' THEN COALESCE(pc.placas, 0) / 2 ELSE COALESCE(pc.placas, 0) END,
  COALESCE(pc.placas, 0),
  COALESCE(bt.cajas, 0),
  COALESCE(bc.cajas_con_reops, 0),
  COALESCE(bc.cajas_con_reops, 0),
  COALESCE(bc.cajas_completas_ro, 0) + COALESCE(bc.cajas_completadas_manual, 0),
  COALESCE(bc.cajas_en_proceso, 0),
  COALESCE(bc.cajas_completas_ro, 0),
  COALESCE(rs.placas_afectadas, 0),
  COALESCE(rs.reops, 0),
  COALESCE(rs.pend, 0),
  COALESCE(rc.recups, 0),
  CASE WHEN COALESCE(rs.reops, 0) = 0 THEN 0
    ELSE round((COALESCE(rs.reops, 0) - COALESCE(rs.pend, 0))::numeric /
      COALESCE(rs.reops, 0) * 1000) / 10 END,
  CASE
    WHEN COALESCE(bc.cajas_con_reops, 0) > 0 THEN 'con_reoperaciones'
    WHEN COALESCE(bc.cajas_en_proceso, 0) > 0 THEN 'en_proceso'
    ELSE 'completada'
  END
FROM production_services ps
LEFT JOIN plate_counts pc ON pc.servicio = ps.nombre
LEFT JOIN box_totals bt ON bt.servicio = ps.nombre
LEFT JOIN reop_by_service rs ON rs.servicio = ps.nombre
LEFT JOIN recup_by_service rc ON rc.servicio = ps.nombre
LEFT JOIN box_counts bc ON bc.servicio = ps.nombre
WHERE ps.produccion_id = p_produccion_id
ORDER BY ps.nombre;
$function$;

GRANT EXECUTE ON FUNCTION public.get_service_metrics(uuid) TO authenticated;

-- ============================================================
-- get_production_metrics: CREATE OR REPLACE with new counters
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_production_metrics(p_produccion_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH placa_counts AS (
  SELECT count(*) AS total_placas
  FROM placas
  WHERE produccion_id = p_produccion_id
),
reop_stats AS (
  SELECT count(*) AS total_reops,
    count(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
    count(DISTINCT placa_id) AS placas_afectadas,
    count(DISTINCT placa_id) FILTER (WHERE estado = 'pendiente') AS placas_con_pendientes
  FROM reoperaciones
  WHERE produccion_id = p_produccion_id AND placa_id IS NOT NULL
),
recup_stats AS (
  SELECT count(*) AS total_recuperaciones
  FROM recuperaciones
  WHERE produccion_id = p_produccion_id
),
box_estado AS (
  SELECT sb.servicio,
    COALESCE(br.pend, 0) AS pend,
    COALESCE(br.reops, 0) AS reops,
    COALESCE(bc.completada_manual, false) AS manual
  FROM service_boxes sb
  LEFT JOIN (
    SELECT p.servicio, p.numero_caja,
      count(r.id) AS reops,
      count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM placas p
    JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
    WHERE p.produccion_id = p_produccion_id
    GROUP BY p.servicio, p.numero_caja
  ) br ON br.servicio = sb.servicio AND br.numero_caja = sb.numero_caja
  LEFT JOIN box_completion bc ON bc.produccion_id = sb.produccion_id
    AND bc.servicio = sb.servicio AND bc.numero_caja = sb.numero_caja
  WHERE sb.produccion_id = p_produccion_id
),
box_summary AS (
  SELECT
    count(*) FILTER (WHERE pend > 0) AS cajas_con_reoperaciones,
    count(*) FILTER (WHERE pend = 0 AND reops = 0 AND manual = false) AS cajas_en_proceso,
    count(*) FILTER (WHERE reops > 0 AND pend = 0) AS cajas_completadas_ro,
    count(*) FILTER (WHERE manual = true AND reops = 0) AS cajas_completadas_manual
  FROM box_estado
),
service_box_summary AS (
  SELECT servicio,
    count(*) FILTER (WHERE pend > 0) AS svc_con_reops,
    count(*) FILTER (WHERE pend = 0 AND reops = 0 AND manual = false) AS svc_en_proceso
  FROM box_estado
  GROUP BY servicio
),
service_summary AS (
  SELECT
    count(*) FILTER (WHERE COALESCE(sbs.svc_con_reops, 0) > 0) AS servicios_con_reops,
    count(*) FILTER (WHERE COALESCE(sbs.svc_con_reops, 0) = 0 AND COALESCE(sbs.svc_en_proceso, 0) > 0) AS servicios_en_proceso,
    count(*) FILTER (WHERE COALESCE(sbs.svc_con_reops, 0) = 0 AND COALESCE(sbs.svc_en_proceso, 0) = 0) AS servicios_completos
  FROM service_box_summary sbs
)
SELECT jsonb_build_object(
  'totalPlacas', COALESCE((SELECT total_placas FROM placa_counts), 0),
  'placasAfectadas', COALESCE((SELECT placas_afectadas FROM reop_stats), 0),
  'placasConPendientes', COALESCE((SELECT placas_con_pendientes FROM reop_stats), 0),
  'porcentajePlacasAfectadas',
    CASE WHEN COALESCE((SELECT total_placas FROM placa_counts), 0) = 0 THEN 0
    ELSE round(COALESCE((SELECT placas_afectadas FROM reop_stats), 0)::numeric /
      (SELECT total_placas FROM placa_counts) * 1000) / 10 END,
  'totalReoperaciones', COALESCE((SELECT total_reops FROM reop_stats), 0),
  'reoperacionesPendientes', COALESCE((SELECT pendientes FROM reop_stats), 0),
  'totalRecuperaciones', COALESCE((SELECT total_recuperaciones FROM recup_stats), 0),
  'porcentajeRecuperacion',
    CASE WHEN COALESCE((SELECT total_reops FROM reop_stats), 0) = 0 THEN 0
    ELSE round(((SELECT total_reops FROM reop_stats) -
      COALESCE((SELECT pendientes FROM reop_stats), 0))::numeric /
      (SELECT total_reops FROM reop_stats) * 1000) / 10 END,
  'cajasConReoperaciones', COALESCE((SELECT cajas_con_reoperaciones FROM box_summary), 0),
  'cajasPendientes', COALESCE((SELECT cajas_con_reoperaciones FROM box_summary), 0),
  'cajasCompletas', COALESCE((SELECT cajas_completadas_ro FROM box_summary), 0) + COALESCE((SELECT cajas_completadas_manual FROM box_summary), 0),
  'cajasEnProceso', COALESCE((SELECT cajas_en_proceso FROM box_summary), 0),
  'cajasCompletadasRo', COALESCE((SELECT cajas_completadas_ro FROM box_summary), 0),
  'serviciosConReoperaciones', COALESCE((SELECT servicios_con_reops FROM service_summary), 0),
  'serviciosPendientes', COALESCE((SELECT servicios_con_reops FROM service_summary), 0),
  'serviciosEnProceso', COALESCE((SELECT servicios_en_proceso FROM service_summary), 0),
  'serviciosCompletos', COALESCE((SELECT servicios_completos FROM service_summary), 0)
);
$function$;
