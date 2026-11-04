CREATE OR REPLACE FUNCTION public.get_report_data(p_produccion_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
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
  box_estado AS (
    SELECT p.servicio, p.numero_caja,
           count(r.id) AS reops,
           count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend
    FROM placas p
    JOIN reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
    WHERE p.produccion_id = p_produccion_id
    GROUP BY p.servicio, p.numero_caja
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
        'estado', CASE WHEN pend > 0 THEN 'pendiente' ELSE 'completo' END,
        'reoperaciones', reops, 'pendientes', pend
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
