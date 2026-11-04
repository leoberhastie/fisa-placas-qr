/*
# Fix service state for services without boxes + update report data for 4 states

## Purpose
1. A service with 0 boxes should be 'en_proceso', not 'completada'.
2. Update get_report_data's estadoCajas section to use the 4-state model and
   include ALL boxes (from service_boxes), not just boxes with reoperations.

## Changes
- get_service_metrics: add CASE for when cajas = 0 → 'en_proceso'
- get_report_data: replace box_estado CTE to join service_boxes with box_completion
  and use 4-state CASE. Add completada_manual and completada_at to estadoCajas output.
*/

CREATE OR REPLACE FUNCTION public.get_service_metrics(p_produccion_id uuid)
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
    WHEN COALESCE(bt.cajas, 0) = 0 THEN 'en_proceso'
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
-- get_report_data: update estadoCajas to 4-state model
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_report_data(p_produccion_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH
reop_with_service AS (
  SELECT r.id, r.placa_id, r.proceso, r.estado, r.fecha_hora, r.operador, r.usuario,
    COALESCE(p.servicio, 'Sin servicio') AS servicio,
    COALESCE(p.numero_caja, '—') AS numero_caja,
    COALESCE(p.serie, '—') AS serie,
    COALESCE(p.posicion, '—') AS posicion,
    ps.tipo_servicio
  FROM reoperaciones r
  LEFT JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  LEFT JOIN production_services ps ON ps.produccion_id = r.produccion_id AND ps.nombre = p.servicio
  WHERE r.produccion_id = p_produccion_id
),
recup_with_service AS (
  SELECT c.id, c.placa_id, c.fecha_hora, c.operador, c.usuario, c.tipo_recuperacion, c.es_manual,
    COALESCE(p.servicio, 'Sin servicio') AS servicio
  FROM recuperaciones c
  LEFT JOIN placas p ON p.id = c.placa_id AND p.produccion_id = c.produccion_id
  WHERE c.produccion_id = p_produccion_id
),
service_reops AS (
  SELECT servicio, count(*) AS reops, count(*) FILTER (WHERE estado = 'pendiente') AS pend
  FROM reop_with_service GROUP BY servicio
),
service_recups AS (
  SELECT servicio, count(*) AS recups FROM recup_with_service GROUP BY servicio
),
box_reops AS (
  SELECT p.servicio, p.numero_caja,
    count(r.id) AS reops,
    count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
  FROM placas p
  JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
  WHERE p.produccion_id = p_produccion_id
  GROUP BY p.servicio, p.numero_caja
),
box_estado AS (
  SELECT sb.servicio, sb.numero_caja,
    COALESCE(br.reops, 0) AS reops,
    COALESCE(br.pend, 0) AS pend,
    COALESCE(bc.completada_manual, false) AS manual
  FROM service_boxes sb
  LEFT JOIN box_reops br ON br.servicio = sb.servicio AND br.numero_caja = sb.numero_caja
  LEFT JOIN box_completion bc ON bc.produccion_id = sb.produccion_id
    AND bc.servicio = sb.servicio AND bc.numero_caja = sb.numero_caja
  WHERE sb.produccion_id = p_produccion_id
),
plate_counts AS (
  SELECT p.servicio, count(*) AS placas
  FROM placas p WHERE p.produccion_id = p_produccion_id GROUP BY p.servicio
),
box_totals AS (
  SELECT sb.servicio, count(*) AS cajas
  FROM service_boxes sb WHERE sb.produccion_id = p_produccion_id GROUP BY sb.servicio
),
total_reops AS (SELECT count(*) AS total FROM reoperaciones WHERE produccion_id = p_produccion_id),
top_placas AS (
  SELECT p.serie, p.posicion, COALESCE(p.servicio, 'Sin servicio') AS servicio,
    COALESCE(p.numero_caja, '—') AS numero_caja,
    count(r.id) AS reops,
    count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
  FROM reoperaciones r
  JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  WHERE r.produccion_id = p_produccion_id
  GROUP BY p.id, p.serie, p.posicion, p.servicio, p.numero_caja
  ORDER BY reops DESC, p.serie
  LIMIT 10
),
evolucion_data AS (
  SELECT d.fecha,
    count(r.id) AS reops,
    count(c.id) AS recups
  FROM (
    SELECT DISTINCT to_char(r.fecha_hora AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS fecha
    FROM reoperaciones r WHERE r.produccion_id = p_produccion_id
    UNION
    SELECT DISTINCT to_char(c.fecha_hora AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS fecha
    FROM recuperaciones c WHERE c.produccion_id = p_produccion_id
  ) d
  LEFT JOIN reoperaciones r ON r.produccion_id = p_produccion_id
    AND to_char(r.fecha_hora AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') = d.fecha
  LEFT JOIN recuperaciones c ON c.produccion_id = p_produccion_id
    AND to_char(c.fecha_hora AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') = d.fecha
  GROUP BY d.fecha
)
SELECT jsonb_build_object(
  'servicioGeneral', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'servicio', ps.nombre, 'tipoServicio', ps.tipo_servicio,
      'series', CASE WHEN ps.tipo_servicio = 'JGS' THEN COALESCE(pc.placas, 0) / 2 ELSE COALESCE(pc.placas, 0) END,
      'cajas', COALESCE(bt.cajas, 0),
      'placas', COALESCE(pc.placas, 0),
      'reoperaciones', COALESCE(sr.reops, 0),
      'recuperadas', COALESCE(sr.reops, 0) - COALESCE(sr.pend, 0),
      'pendientes', COALESCE(sr.pend, 0),
      'recuperaciones', COALESCE(srec.recups, 0),
      'porcentajeTotal', CASE WHEN (SELECT total FROM total_reops) = 0 THEN 0
        ELSE round(COALESCE(sr.reops, 0)::numeric / (SELECT total FROM total_reops) * 1000) / 10 END
    ) ORDER BY ps.nombre)
    FROM production_services ps
    LEFT JOIN plate_counts pc ON pc.servicio = ps.nombre
    LEFT JOIN box_totals bt ON bt.servicio = ps.nombre
    LEFT JOIN service_reops sr ON sr.servicio = ps.nombre
    LEFT JOIN service_recups srec ON srec.servicio = ps.nombre
    WHERE ps.produccion_id = p_produccion_id
  ), '[]'::jsonb),
  'reopsByServicioProceso', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'servicio', servicio, 'proceso', proceso, 'total', total, 'pendientes', pendientes
    ) ORDER BY servicio, total DESC)
    FROM (
      SELECT servicio, proceso, count(*) AS total,
        count(*) FILTER (WHERE estado = 'pendiente') AS pendientes
      FROM reop_with_service GROUP BY servicio, proceso
    ) r
  ), '[]'::jsonb),
  'recupsByServicio', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'servicio', servicio, 'total', total, 'manuales', manuales, 'normales', normales
    ) ORDER BY total DESC)
    FROM (
      SELECT servicio, count(*) AS total,
        count(*) FILTER (WHERE es_manual) AS manuales,
        count(*) FILTER (WHERE NOT es_manual) AS normales
      FROM recup_with_service GROUP BY servicio
    ) r
  ), '[]'::jsonb),
  'estadoCajas', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'servicio', servicio, 'caja', numero_caja,
      'estado', CASE
        WHEN pend > 0 THEN 'con_reoperaciones'
        WHEN reops > 0 THEN 'completada_ro'
        WHEN manual THEN 'completada'
        ELSE 'en_proceso'
      END,
      'reoperaciones', reops, 'pendientes', pend,
      'completadaManual', manual
    ) ORDER BY servicio, numero_caja)
    FROM box_estado
  ), '[]'::jsonb),
  'topPlacas', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'serie', serie, 'posicion', posicion, 'servicio', servicio, 'caja', numero_caja,
      'reoperaciones', reops, 'pendientes', pend
    ) ORDER BY reops DESC, serie)
    FROM top_placas
  ), '[]'::jsonb),
  'evolucion', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'fecha', fecha, 'reoperaciones', reops, 'recuperaciones', recups
    ) ORDER BY fecha)
    FROM evolucion_data
  ), '[]'::jsonb),
  'recupsPorOperador', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'operador', operador, 'total', total, 'manuales', manuales
    ) ORDER BY total DESC)
    FROM (
      SELECT COALESCE(NULLIF(operador, ''), COALESCE(NULLIF(usuario, ''), 'Sin operador')) AS operador,
        count(*) AS total,
        count(*) FILTER (WHERE es_manual) AS manuales
      FROM recup_with_service
      GROUP BY COALESCE(NULLIF(operador, ''), COALESCE(NULLIF(usuario, ''), 'Sin operador'))
    ) r
  ), '[]'::jsonb),
  'incidenciasPorMotivo', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'motivo', motivo, 'total', total
    ) ORDER BY total DESC)
    FROM (
      SELECT COALESCE(NULLIF(tipo_recuperacion, ''), 'Sin motivo') AS motivo, count(*) AS total
      FROM recup_with_service GROUP BY COALESCE(NULLIF(tipo_recuperacion, ''), 'Sin motivo')
    ) r
  ), '[]'::jsonb)
);
$function$;
