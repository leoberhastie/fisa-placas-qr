CREATE OR REPLACE FUNCTION public.get_production_metrics(p_produccion_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
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
    SELECT p.servicio, p.numero_caja,
           count(r.id) AS reops,
           count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM reoperaciones r
    JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
    WHERE r.produccion_id = p_produccion_id
    GROUP BY p.servicio, p.numero_caja
  ),
  box_summary AS (
    SELECT
      count(*) AS cajas_con_reoperaciones,
      count(*) FILTER (WHERE pend > 0) AS cajas_pendientes,
      count(*) FILTER (WHERE reops > 0 AND pend = 0) AS cajas_completas
    FROM box_estado
  ),
  service_estado AS (
    SELECT p.servicio,
           count(r.id) AS reops,
           count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM reoperaciones r
    JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
    WHERE r.produccion_id = p_produccion_id
    GROUP BY p.servicio
  ),
  service_summary AS (
    SELECT
      count(*) FILTER (WHERE reops > 0) AS servicios_con_reops,
      count(*) FILTER (WHERE pend > 0) AS servicios_pendientes,
      count(*) FILTER (WHERE reops > 0 AND pend = 0) AS servicios_completos
    FROM service_estado
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
    'cajasPendientes', COALESCE((SELECT cajas_pendientes FROM box_summary), 0),
    'cajasCompletas', COALESCE((SELECT cajas_completas FROM box_summary), 0),
    'serviciosConReoperaciones', COALESCE((SELECT servicios_con_reops FROM service_summary), 0),
    'serviciosPendientes', COALESCE((SELECT servicios_pendientes FROM service_summary), 0),
    'serviciosCompletos', COALESCE((SELECT servicios_completos FROM service_summary), 0)
  );
$function$;
