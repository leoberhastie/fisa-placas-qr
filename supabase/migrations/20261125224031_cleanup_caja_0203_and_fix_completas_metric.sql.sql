/*
# Limpieza de datos de prueba (caja 0203, PRIV AUTOMOVIL (P10-030-26), P2-GUANAJUATO)
# + correccion de metricas: "Cajas completas" solo cuenta cajas CERRADAS.

El usuario Filtro estaba probando en caliente; se eliminan sus movimientos
como si nunca hubieran ocurrido.
*/

-- ============================================================
-- 1. Eliminar movimientos de prueba de la caja 0203
-- ============================================================
DO $$
DECLARE
  v_pid uuid := 'eaaee515-5244-4e45-9f2a-be0dc021be31';
  v_servicio text := 'PRIV AUTOMOVIL (P10-030-26)';
  v_caja text := '0203';
BEGIN
  -- Historial ligado a placas de esa caja (reoperaciones/recuperaciones borradas abajo)
  DELETE FROM public.historial_operaciones h
  USING public.placas pl
  WHERE h.placa_id = pl.id
    AND pl.produccion_id = v_pid
    AND pl.servicio = v_servicio
    AND pl.numero_caja = v_caja;

  -- Historial de cambios de estado de la caja (cierre/reapertura)
  DELETE FROM public.historial_operaciones
  WHERE produccion_id = v_pid
    AND tipo_operacion = 'cambio_estado'
    AND observaciones LIKE format('Caja %s del servicio %s%%', v_caja, v_servicio);

  -- Recuperaciones de prueba
  DELETE FROM public.recuperaciones c
  USING public.placas pl
  WHERE c.placa_id = pl.id
    AND c.produccion_id = pl.produccion_id
    AND pl.produccion_id = v_pid
    AND pl.servicio = v_servicio
    AND pl.numero_caja = v_caja;

  -- Reoperaciones de prueba
  DELETE FROM public.reoperaciones r
  USING public.placas pl
  WHERE r.placa_id = pl.id
    AND r.produccion_id = pl.produccion_id
    AND pl.produccion_id = v_pid
    AND pl.servicio = v_servicio
    AND pl.numero_caja = v_caja;

  -- Completados de placas (las 2 de prueba)
  DELETE FROM public.placa_completados
  WHERE produccion_id = v_pid
    AND servicio = v_servicio
    AND numero_caja = v_caja;

  -- Registro de cierre de la caja (quedo como si nunca se cerrara)
  DELETE FROM public.box_completion
  WHERE produccion_id = v_pid
    AND servicio = v_servicio
    AND numero_caja = v_caja;

  -- Bump de version para refrescar las pantallas
  UPDATE public.productions
  SET version_datos = version_datos + 1, updated_at = now()
  WHERE id = v_pid;
END;
$$;

-- ============================================================
-- 2. get_production_metrics: Cajas completas = cerradas solamente
--    (Cerrada y Cerrada con RO). Antes contaba cajas con reoperaciones
--    recuperadas aunque estuvieran abiertas.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_production_metrics(p_produccion_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
WITH placa_counts AS (
  SELECT count(*) AS total_placas
  FROM public.placas
  WHERE produccion_id = p_produccion_id AND activo = true
),
reop_stats AS (
  SELECT count(*) AS total_reops,
    count(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
    count(DISTINCT placa_id) AS placas_afectadas,
    count(DISTINCT placa_id) FILTER (WHERE estado = 'pendiente') AS placas_con_pendientes
  FROM public.reoperaciones
  WHERE produccion_id = p_produccion_id AND placa_id IS NOT NULL
),
recup_stats AS (
  SELECT count(*) AS total_recuperaciones,
    count(*) FILTER (WHERE tipo_recuperacion = 'qr') AS recuperadas_qr
  FROM public.recuperaciones
  WHERE produccion_id = p_produccion_id
),
completado_stats AS (
  SELECT count(*) AS placas_completadas
  FROM public.placa_completados
  WHERE produccion_id = p_produccion_id
),
box_estado AS (
  SELECT sb.servicio,
    COALESCE(br.pend, 0) AS pend,
    COALESCE(br.reops, 0) AS reops,
    COALESCE(bc.completada_manual, false) AS manual
  FROM public.service_boxes sb
  LEFT JOIN (
    SELECT p.servicio, p.numero_caja,
      count(r.id) AS reops,
      count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM public.placas p
    JOIN public.reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
    WHERE p.produccion_id = p_produccion_id
    GROUP BY p.servicio, p.numero_caja
  ) br ON br.servicio = sb.servicio AND br.numero_caja = sb.numero_caja
  LEFT JOIN public.box_completion bc ON bc.produccion_id = sb.produccion_id
    AND bc.servicio = sb.servicio AND bc.numero_caja = sb.numero_caja
  WHERE sb.produccion_id = p_produccion_id
),
box_summary AS (
  SELECT
    count(*) FILTER (WHERE pend > 0) AS cajas_con_reoperaciones,
    count(*) FILTER (WHERE pend = 0 AND manual = false) AS cajas_en_proceso,
    count(*) FILTER (WHERE manual = true AND reops > 0) AS cajas_completadas_ro,
    count(*) FILTER (WHERE manual = true AND reops = 0) AS cajas_completadas_manual
  FROM box_estado
),
service_box_summary AS (
  SELECT servicio,
    count(*) FILTER (WHERE pend > 0) AS svc_con_reops,
    count(*) FILTER (WHERE pend = 0 AND manual = false) AS svc_en_proceso
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
  'serviciosCompletos', COALESCE((SELECT servicios_completos FROM service_summary), 0),
  'placasCompletadas', COALESCE((SELECT placas_completadas FROM completado_stats), 0),
  'placasFaltantesCompletar', COALESCE((SELECT total_placas FROM placa_counts), 0) - COALESCE((SELECT placas_completadas FROM completado_stats), 0),
  'porcentajeAvanceReal',
    CASE WHEN COALESCE((SELECT total_placas FROM placa_counts), 0) = 0 THEN 0
    ELSE round(COALESCE((SELECT placas_completadas FROM completado_stats), 0)::numeric /
      (SELECT total_placas FROM placa_counts) * 1000) / 10 END,
  'reoperacionesRecuperadasQr', COALESCE((SELECT recuperadas_qr FROM recup_stats), 0)
);
$$;
