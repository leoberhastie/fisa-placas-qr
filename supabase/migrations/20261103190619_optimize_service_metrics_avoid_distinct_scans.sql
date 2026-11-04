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
    CASE WHEN ps.tipo_servicio = 'JGS' THEN COALESCE(pc.placas, 0) / 2 ELSE COALESCE(pc.placas, 0) END,
    COALESCE(pc.placas, 0),
    COALESCE(bt.cajas, 0),
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
  LEFT JOIN box_totals bt ON bt.servicio = ps.nombre
  LEFT JOIN reop_by_service rs ON rs.servicio = ps.nombre
  LEFT JOIN recup_by_service rc ON rc.servicio = ps.nombre
  LEFT JOIN box_counts bc ON bc.servicio = ps.nombre
  WHERE ps.produccion_id = p_produccion_id
  ORDER BY ps.nombre;
$function$;
