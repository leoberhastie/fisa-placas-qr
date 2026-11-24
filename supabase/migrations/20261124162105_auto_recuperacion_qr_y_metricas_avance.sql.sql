/*
# Auto-recuperación en Completado QR + métricas de avance real

## Cambios

### 1. Función marcar_placa_completada — auto-recuperar reoperaciones pendientes
Cuando se escanea una placa con reoperaciones pendientes en Completado QR:
- Marca todas las reoperaciones pendientes de esa placa como 'completo'
- Inserta un registro en recuperaciones con observaciones 'Completado via QR'
- Registra trazabilidad en historial_operaciones
- Retorna cuántas reoperaciones se cerraron

### 2. Función get_production_metrics — ampliar con métricas de completado
Agrega: placasCompletadas, placasFaltantesCompletar, porcentajeAvanceReal, reoperacionesRecuperadasQr
*/

CREATE OR REPLACE FUNCTION marcar_placa_completada(
  p_produccion_id uuid,
  p_placa_id uuid,
  p_operador text,
  p_usuario text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placa RECORD;
  v_existente RECORD;
  v_total_placas int;
  v_completadas int;
  v_caja_completada boolean := false;
  v_reops_cerradas int := 0;
  v_reop RECORD;
BEGIN
  SELECT serie, posicion, servicio, numero_caja INTO v_placa
  FROM placas
  WHERE id = p_placa_id AND produccion_id = p_produccion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Placa no encontrada');
  END IF;

  SELECT id, fecha_completado INTO v_existente
  FROM placa_completados
  WHERE produccion_id = p_produccion_id AND placa_id = p_placa_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ya_completada', true,
      'fecha_completado', v_existente.fecha_completado,
      'serie', v_placa.serie,
      'posicion', v_placa.posicion,
      'servicio', v_placa.servicio,
      'numero_caja', v_placa.numero_caja
    );
  END IF;

  INSERT INTO placa_completados (produccion_id, placa_id, operador, usuario, servicio, numero_caja, serie, posicion)
  VALUES (p_produccion_id, p_placa_id, p_operador, p_usuario, v_placa.servicio, v_placa.numero_caja, v_placa.serie, v_placa.posicion);

  INSERT INTO historial_operaciones (produccion_id, placa_id, tipo_operacion, proceso, operador, usuario, estado_anterior, estado_nuevo, observaciones)
  VALUES (p_produccion_id, p_placa_id, 'cambio_estado', '', p_operador, p_usuario, '', 'completado', 'Placa marcada como completada via QR');

  -- Auto-recuperar reoperaciones pendientes
  FOR v_reop IN
    SELECT id, proceso FROM reoperaciones
    WHERE produccion_id = p_produccion_id
      AND placa_id = p_placa_id
      AND estado = 'pendiente'
  LOOP
    UPDATE reoperaciones SET estado = 'completo' WHERE id = v_reop.id;

    INSERT INTO recuperaciones (produccion_id, placa_id, fecha_hora, operador, usuario, es_manual, tipo_recuperacion, observaciones)
    VALUES (p_produccion_id, p_placa_id, now(), p_operador, p_usuario, false, 'qr', 'Completado via QR');

    INSERT INTO historial_operaciones (produccion_id, placa_id, tipo_operacion, proceso, operador, usuario, estado_anterior, estado_nuevo, observaciones)
    VALUES (p_produccion_id, p_placa_id, 'recuperacion', v_reop.proceso, p_operador, p_usuario, 'pendiente', 'completo', 'Recuperacion automatica al completar via QR');

    v_reops_cerradas := v_reops_cerradas + 1;
  END LOOP;

  SELECT count(*) INTO v_total_placas
  FROM placas
  WHERE produccion_id = p_produccion_id
    AND servicio = v_placa.servicio
    AND numero_caja = v_placa.numero_caja
    AND activo = true;

  SELECT count(*) INTO v_completadas
  FROM placa_completados pc
  JOIN placas p ON p.id = pc.placa_id
  WHERE pc.produccion_id = p_produccion_id
    AND p.servicio = v_placa.servicio
    AND p.numero_caja = v_placa.numero_caja
    AND p.activo = true;

  IF v_completadas >= v_total_placas AND v_total_placas > 0 THEN
    INSERT INTO box_completion (produccion_id, servicio, numero_caja, completada_manual, completada_at, completada_by)
    VALUES (p_produccion_id, v_placa.servicio, v_placa.numero_caja, true, now(), NULL)
    ON CONFLICT (produccion_id, servicio, numero_caja)
    DO UPDATE SET completada_manual = true, completada_at = now(), updated_at = now();

    INSERT INTO historial_operaciones (produccion_id, placa_id, tipo_operacion, proceso, operador, usuario, estado_anterior, estado_nuevo, observaciones)
    VALUES (p_produccion_id, NULL, 'cambio_estado', '', p_operador, p_usuario, 'en_proceso', 'completada', 'Caja completada automaticamente al escanear todas las placas');

    v_caja_completada := true;
  END IF;

  UPDATE productions SET version_datos = version_datos + 1 WHERE id = p_produccion_id;

  RETURN jsonb_build_object(
    'ya_completada', false,
    'fecha_completado', now(),
    'serie', v_placa.serie,
    'posicion', v_placa.posicion,
    'servicio', v_placa.servicio,
    'numero_caja', v_placa.numero_caja,
    'caja_completada_automatico', v_caja_completada,
    'total_placas_caja', v_total_placas,
    'completadas_caja', v_completadas,
    'reoperaciones_cerradas', v_reops_cerradas
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION marcar_placa_completada(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION marcar_placa_completada(uuid, uuid, text, text) TO authenticated;

-- ============================================================
-- 2. Ampliar get_production_metrics con métricas de completado
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
  WHERE produccion_id = p_produccion_id AND activo = true
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
  SELECT count(*) AS total_recuperaciones,
    count(*) FILTER (WHERE tipo_recuperacion = 'qr') AS recuperadas_qr
  FROM recuperaciones
  WHERE produccion_id = p_produccion_id
),
completado_stats AS (
  SELECT count(*) AS placas_completadas
  FROM placa_completados
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
  'serviciosCompletos', COALESCE((SELECT servicios_completos FROM service_summary), 0),
  'placasCompletadas', COALESCE((SELECT placas_completadas FROM completado_stats), 0),
  'placasFaltantesCompletar', COALESCE((SELECT total_placas FROM placa_counts), 0) - COALESCE((SELECT placas_completadas FROM completado_stats), 0),
  'porcentajeAvanceReal',
    CASE WHEN COALESCE((SELECT total_placas FROM placa_counts), 0) = 0 THEN 0
    ELSE round(COALESCE((SELECT placas_completadas FROM completado_stats), 0)::numeric /
      (SELECT total_placas FROM placa_counts) * 1000) / 10 END,
  'reoperacionesRecuperadasQr', COALESCE((SELECT recuperadas_qr FROM recup_stats), 0)
);
$function$;

GRANT EXECUTE ON FUNCTION public.get_production_metrics(uuid) TO authenticated;
