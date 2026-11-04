/*
# Optimize plate queries: server-side aggregation functions and indexes

1. Purpose
- The `placas` table has ~787,000 rows. The frontend was downloading every plate to compute metrics in JavaScript, causing very slow page loads.
- These functions move ALL aggregation to the database so the frontend receives only summary rows (a few dozen), not hundreds of thousands of plates.

2. New indexes
- `reoperaciones_produccion_placa_idx` on `reoperaciones(produccion_id, placa_id)` — speeds up JOINs between reoperaciones and placas for metric calculations.
- `recuperaciones_produccion_placa_idx` on `recuperaciones(produccion_id, placa_id)` — same for recuperaciones.
- Drop 2 of the 3 duplicate indexes on `placas(produccion_id, serie, posicion)` — keeps only `placas_produccion_serie_posicion_uniq`.

3. New functions
- `get_production_metrics(p_produccion_id)`: returns a single JSON with all KPIs for the manager dashboard (totalPlacas, placasAfectadas, placasConPendientes, porcentajePlacasAfectadas, totalReoperaciones, reoperacionesPendientes, totalRecuperaciones, porcentajeRecuperacion, cajasConReoperaciones, cajasPendientes, cajasCompletas, serviciosConReoperaciones, serviciosPendientes, serviciosCompletos).
- `get_service_metrics(p_produccion_id)`: returns one row per service with tipoServicio, series, placas, cajas, cajasConReoperaciones, cajasPendientes, cajasCompletas, placasAfectadas, reoperaciones, pendientes, recuperaciones, porcentajeRecuperacion, estado.
- `get_box_metrics(p_produccion_id)`: returns one row per box (servicio + numero_caja) that has reoperaciones, with placas count, placasAfectadas, placasConPendientes, reoperaciones, pendientes, recuperaciones, estado. Only boxes with reoperaciones are included (matching the current frontend behavior).
- `get_box_placa_movements(p_produccion_id, p_servicio, p_numero_caja)`: returns one row per plate within a box that has reoperaciones, with serie, posicion, proceso (latest), fecha (latest), operador (latest), movimientos count, pendientes count, estado. Used by the BoxDetailModal instead of downloading all plates.

4. Security
- All functions run as SECURITY INVOKER, so existing RLS policies on placas, reoperaciones, recuperaciones, production_services, and service_boxes still apply.
- EXECUTE is revoked from PUBLIC and anon; granted only to authenticated.

5. Data safety
- No tables, columns, or existing rows are changed. Only new indexes and functions are added, and duplicate indexes are dropped (data-safe: indexes can be recreated from the data).
*/

-- =========================================================
-- Indexes
-- =========================================================

CREATE INDEX IF NOT EXISTS reoperaciones_produccion_placa_idx
  ON public.reoperaciones (produccion_id, placa_id);

CREATE INDEX IF NOT EXISTS recuperaciones_produccion_placa_idx
  ON public.recuperaciones (produccion_id, placa_id);

-- Drop duplicate indexes (keep placas_produccion_serie_posicion_uniq)
DROP INDEX IF EXISTS public.placas_produccion_serie_posicion_unique;
DROP INDEX IF EXISTS public.placas_serie_posicion_key;

-- =========================================================
-- get_production_metrics: single JSON with all dashboard KPIs
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_production_metrics(p_produccion_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH placa_counts AS (
    SELECT count(*) AS total_placas,
           count(DISTINCT servicio) AS total_servicios
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
  box_stats AS (
    SELECT
      count(DISTINCT r.placa_id) AS cajas_con_reops,
      count(DISTINCT p.numero_caja) FILTER (WHERE EXISTS (
        SELECT 1 FROM reoperaciones r2
        WHERE r2.produccion_id = p.produccion_id AND r2.placa_id = p.id
      )) AS cajas_any_reops
    FROM placas p
    JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
    WHERE p.produccion_id = p_produccion_id
  ),
  box_estado AS (
    SELECT p.servicio, p.numero_caja,
           count(r.id) AS reops,
           count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM placas p
    JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
    WHERE p.produccion_id = p_produccion_id
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
    SELECT ps.nombre,
           count(r.id) AS reops,
           count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM production_services ps
    LEFT JOIN placas p ON p.produccion_id = ps.produccion_id AND p.servicio = ps.nombre
    LEFT JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
    WHERE ps.produccion_id = p_produccion_id
    GROUP BY ps.nombre
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

-- =========================================================
-- get_service_metrics: one row per service with full metrics
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_service_metrics(p_produccion_id uuid)
RETURNS TABLE (
  servicio text,
  tipo_servicio text,
  series bigint,
  placas bigint,
  cajas bigint,
  cajas_con_reoperaciones bigint,
  cajas_pendientes bigint,
  cajas_completas bigint,
  placas_afectadas bigint,
  reoperaciones bigint,
  pendientes bigint,
  recuperaciones bigint,
  porcentaje_recuperacion numeric,
  estado text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH plate_counts AS (
    SELECT p.servicio,
           count(*) AS placas,
           count(DISTINCT p.consecutivo) AS series,
           count(DISTINCT p.numero_caja) AS cajas
    FROM placas p
    WHERE p.produccion_id = p_produccion_id
    GROUP BY p.servicio
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
    SELECT p.servicio,
           count(c.id) AS recups
    FROM recuperaciones c
    JOIN placas p ON p.id = c.placa_id AND p.produccion_id = c.produccion_id
    WHERE c.produccion_id = p_produccion_id
    GROUP BY p.servicio
  ),
  box_estado AS (
    SELECT p.servicio, p.numero_caja,
           count(r.id) AS reops,
           count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM placas p
    JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
    WHERE p.produccion_id = p_produccion_id
    GROUP BY p.servicio, p.numero_caja
  ),
  box_counts AS (
    SELECT servicio,
           count(*) AS cajas_con_reops,
           count(*) FILTER (WHERE pend > 0) AS cajas_pend,
           count(*) FILTER (WHERE reops > 0 AND pend = 0) AS cajas_completas
    FROM box_estado
    GROUP BY servicio
  )
  SELECT
    ps.nombre,
    ps.tipo_servicio,
    COALESCE(pc.series, 0),
    COALESCE(pc.placas, 0),
    COALESCE(pc.cajas, 0),
    COALESCE(bc.cajas_con_reops, 0),
    COALESCE(bc.cajas_pend, 0),
    COALESCE(bc.cajas_completas, 0),
    COALESCE(rs.placas_afectadas, 0),
    COALESCE(rs.reops, 0),
    COALESCE(rs.pend, 0),
    COALESCE(rc.recups, 0),
    CASE WHEN COALESCE(rs.reops, 0) = 0 THEN 0
         ELSE round((COALESCE(rs.reops, 0) - COALESCE(rs.pend, 0))::numeric /
                     COALESCE(rs.reops, 0) * 1000) / 10 END,
    CASE WHEN COALESCE(rs.reops, 0) = 0 THEN 'sin_reoperaciones'
         WHEN COALESCE(rs.pend, 0) > 0 THEN 'pendiente'
         ELSE 'completo' END
  FROM production_services ps
  LEFT JOIN plate_counts pc ON pc.servicio = ps.nombre
  LEFT JOIN reop_by_service rs ON rs.servicio = ps.nombre
  LEFT JOIN recup_by_service rc ON rc.servicio = ps.nombre
  LEFT JOIN box_counts bc ON bc.servicio = ps.nombre
  WHERE ps.produccion_id = p_produccion_id
  ORDER BY ps.nombre;
$function$;

-- =========================================================
-- get_box_metrics: one row per box with reoperaciones
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_box_metrics(p_produccion_id uuid)
RETURNS TABLE (
  key text,
  servicio text,
  numero_caja text,
  placas bigint,
  placas_afectadas bigint,
  placas_con_pendientes bigint,
  reoperaciones bigint,
  pendientes bigint,
  recuperaciones bigint,
  estado text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH box_placa_counts AS (
    SELECT p.servicio, p.numero_caja, count(*) AS placas
    FROM placas p
    WHERE p.produccion_id = p_produccion_id
    GROUP BY p.servicio, p.numero_caja
  ),
  box_reops AS (
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
    br.servicio || '|' || br.numero_caja,
    br.servicio,
    br.numero_caja,
    COALESCE(bpc.placas, 0),
    COALESCE(br.placas_afectadas, 0),
    COALESCE(br.placas_con_pendientes, 0),
    COALESCE(br.reops, 0),
    COALESCE(br.pend, 0),
    COALESCE(bcr.recups, 0),
    CASE WHEN COALESCE(br.pend, 0) > 0 THEN 'pendiente' ELSE 'completo' END
  FROM box_reops br
  LEFT JOIN box_placa_counts bpc ON bpc.servicio = br.servicio AND bpc.numero_caja = br.numero_caja
  LEFT JOIN box_recups bcr ON bcr.servicio = br.servicio AND bcr.numero_caja = br.numero_caja
  ORDER BY br.servicio, br.numero_caja;
$function$;

-- =========================================================
-- get_box_placa_movements: plates with reoperaciones for a box
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_box_placa_movements(
  p_produccion_id uuid,
  p_servicio text,
  p_numero_caja text
)
RETURNS TABLE (
  placa_id uuid,
  serie text,
  posicion text,
  proceso text,
  fecha text,
  operador text,
  movimientos bigint,
  pendientes bigint,
  estado text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH box_placas AS (
    SELECT id, serie, posicion, consecutivo
    FROM placas
    WHERE produccion_id = p_produccion_id AND servicio = p_servicio AND numero_caja = p_numero_caja
  ),
  reop_counts AS (
    SELECT r.placa_id,
           count(*) AS movimientos,
           count(*) FILTER (WHERE r.estado = 'pendiente') AS pendientes
    FROM reoperaciones r
    JOIN box_placas bp ON bp.id = r.placa_id
    WHERE r.produccion_id = p_produccion_id
    GROUP BY r.placa_id
  ),
  latest_reop AS (
    SELECT DISTINCT ON (r.placa_id)
           r.placa_id, r.proceso, r.fecha_hora::text AS fecha, r.operador
    FROM reoperaciones r
    JOIN box_placas bp ON bp.id = r.placa_id
    WHERE r.produccion_id = p_produccion_id
    ORDER BY r.placa_id, r.fecha_hora DESC, r.id DESC
  )
  SELECT
    bp.id,
    bp.serie,
    bp.posicion,
    lr.proceso,
    lr.fecha,
    lr.operador,
    rc.movimientos,
    rc.pendientes,
    CASE WHEN rc.pendientes > 0 THEN 'pendiente' ELSE 'completo' END
  FROM box_placas bp
  JOIN reop_counts rc ON rc.placa_id = bp.id
  LEFT JOIN latest_reop lr ON lr.placa_id = bp.id
  ORDER BY bp.consecutivo ASC;
$function$;

-- =========================================================
-- Grants
-- =========================================================

REVOKE EXECUTE ON FUNCTION public.get_production_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_production_metrics(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_service_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_metrics(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_box_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_box_metrics(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_box_placa_movements(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_box_placa_movements(uuid, text, text) TO authenticated;
