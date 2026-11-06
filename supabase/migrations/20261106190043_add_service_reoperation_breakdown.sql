CREATE OR REPLACE FUNCTION public.get_service_reoperation_breakdown(p_produccion_id uuid)
RETURNS TABLE(servicio text, placas_pendientes bigint, procesos jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH reops AS (
  SELECT p.servicio, r.proceso, r.estado, r.placa_id
  FROM reoperaciones r
  JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  WHERE r.produccion_id = p_produccion_id
),
pend_placas AS (
  SELECT reops.servicio, count(DISTINCT reops.placa_id) AS n
  FROM reops
  WHERE reops.estado = 'pendiente'
  GROUP BY reops.servicio
),
por_proceso AS (
  SELECT reops.servicio, reops.proceso, count(*) AS total
  FROM reops
  GROUP BY reops.servicio, reops.proceso
)
SELECT
  ps.nombre,
  COALESCE(pp.n, 0),
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('proceso', x.proceso, 'total', x.total) ORDER BY x.total DESC)
     FROM por_proceso x WHERE x.servicio = ps.nombre),
    '[]'::jsonb
  )
FROM production_services ps
LEFT JOIN pend_placas pp ON pp.servicio = ps.nombre
WHERE ps.produccion_id = p_produccion_id
ORDER BY ps.nombre;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_service_reoperation_breakdown(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_reoperation_breakdown(uuid) TO authenticated;