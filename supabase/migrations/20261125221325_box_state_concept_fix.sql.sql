/*
# Correcciones de concepto caja cerrada / completada

1. list_service_boxes: excluya solo cajas actualmente cerradas (completada_manual = true).
   Antes excluyba cualquier caja con registro en box_completion, asi que una caja
   reabierta desaparecia de Reoperaciones por lotes.
2. Estado de caja alineado al concepto: solo el cierre define "completada"/"completada_ro".
   Una caja abierta con reoperaciones ya recuperadas vuelve a 'en_proceso'.
   - pend > 0            -> con_reoperaciones (bloqueada)
   - cerrada + reops > 0 -> completada_ro     (Cerrada con RO)
   - cerrada             -> completada        (Cerrada)
   - abierta             -> en_proceso
   Aplica a get_box_metrics, get_service_box_page y reopen_box.
*/

-- ============================================================
-- list_service_boxes: respetar reaperturas
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_service_boxes(
  p_produccion_id uuid,
  p_servicio text
)
RETURNS TABLE (numero_caja text, placas bigint, placas_reoperadas bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.numero_caja,
    count(*)::bigint AS placas,
    count(*) FILTER (
      WHERE EXISTS (SELECT 1 FROM public.reoperaciones r WHERE r.placa_id = p.id)
    )::bigint AS placas_reoperadas
  FROM public.placas p
  WHERE p.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
    AND NOT EXISTS (
      SELECT 1 FROM public.box_completion bc
      WHERE bc.produccion_id = p.produccion_id
        AND bc.servicio = p.servicio
        AND bc.numero_caja = p.numero_caja
        AND bc.completada_manual = true
    )
  GROUP BY p.numero_caja
  ORDER BY
    CASE WHEN p.numero_caja ~ '^[0-9]+$' THEN p.numero_caja::bigint END NULLS LAST,
    p.numero_caja;
$$;

GRANT EXECUTE ON FUNCTION public.list_service_boxes(uuid, text) TO authenticated;

-- ============================================================
-- reopen_box: al reabrir, la caja vuelve a en_proceso si no hay pendientes
-- ============================================================
CREATE OR REPLACE FUNCTION public.reopen_box(
  p_produccion_id uuid,
  p_servicio text,
  p_numero_caja text
)
RETURNS TABLE (estado text, completada_manual boolean, completada_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_box_exists boolean;
  v_pendientes int;
  v_reops int;
  v_current_manual boolean;
  v_estado_anterior text;
  v_estado_nuevo text;
  v_usuario text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para reabrir una caja.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.service_boxes sb
    WHERE sb.produccion_id = p_produccion_id
      AND sb.servicio = p_servicio
      AND sb.numero_caja = p_numero_caja
  ) INTO v_box_exists;
  IF NOT v_box_exists THEN
    RAISE EXCEPTION 'La caja % del servicio % no existe en esta producción.', p_numero_caja, p_servicio;
  END IF;

  SELECT bc.completada_manual INTO v_current_manual
  FROM public.box_completion bc
  WHERE bc.produccion_id = p_produccion_id
    AND bc.servicio = p_servicio
    AND bc.numero_caja = p_numero_caja;

  IF NOT COALESCE(v_current_manual, false) THEN
    RAISE EXCEPTION 'La caja no está marcada como completada manualmente.';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE r.estado = 'pendiente')
  INTO v_reops, v_pendientes
  FROM public.reoperaciones r
  JOIN public.placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  WHERE r.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
    AND p.numero_caja = p_numero_caja;

  v_estado_anterior := CASE
    WHEN v_pendientes > 0 THEN 'con_reoperaciones'
    WHEN v_reops > 0 THEN 'completada_ro'
    ELSE 'completada'
  END;

  UPDATE public.box_completion bc
  SET completada_manual = false,
      completada_at = null,
      completada_by = null,
      updated_at = now()
  WHERE bc.produccion_id = p_produccion_id
    AND bc.servicio = p_servicio
    AND bc.numero_caja = p_numero_caja;

  v_estado_nuevo := CASE
    WHEN v_pendientes > 0 THEN 'con_reoperaciones'
    ELSE 'en_proceso'
  END;

  SELECT pr.full_name INTO v_usuario FROM public.profiles pr WHERE pr.id = v_uid;
  IF v_usuario IS NULL THEN v_usuario := ''; END IF;

  INSERT INTO public.historial_operaciones (
    produccion_id, placa_id, tipo_operacion, proceso,
    operador, usuario, estado_anterior, estado_nuevo, observaciones
  ) VALUES (
    p_produccion_id, NULL, 'cambio_estado', '',
    '', v_usuario, v_estado_anterior, v_estado_nuevo,
    format('Caja %s del servicio %s reabierta', p_numero_caja, p_servicio)
  );

  UPDATE public.productions
  SET version_datos = version_datos + 1, updated_at = now()
  WHERE id = p_produccion_id;

  RETURN QUERY SELECT v_estado_nuevo, false, NULL::timestamptz;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_box(uuid, text, text) TO authenticated;

-- ============================================================
-- get_box_metrics: estado segun concepto (solo cierre => completada)
-- ============================================================
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
  estado text,
  completada_manual boolean,
  completada_at timestamptz,
  placas_no_completadas bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
WITH box_reops AS (
  SELECT p.servicio, p.numero_caja,
    count(r.id) AS reops,
    count(r.id) FILTER (WHERE r.estado = 'pendiente') AS pend,
    count(DISTINCT r.placa_id) AS placas_afectadas,
    count(DISTINCT r.placa_id) FILTER (WHERE r.estado = 'pendiente') AS placas_con_pendientes
  FROM public.placas p
  JOIN public.reoperaciones r ON r.produccion_id = p.produccion_id AND r.placa_id = p.id
  WHERE p.produccion_id = p_produccion_id
  GROUP BY p.servicio, p.numero_caja
),
box_recups AS (
  SELECT p.servicio, p.numero_caja, count(c.id) AS recups
  FROM public.placas p
  JOIN public.recuperaciones c ON c.produccion_id = p.produccion_id AND c.placa_id = p.id
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
    WHEN COALESCE(bc.completada_manual, false) AND COALESCE(br.reops, 0) > 0 THEN 'completada_ro'
    WHEN COALESCE(bc.completada_manual, false) THEN 'completada'
    ELSE 'en_proceso'
  END,
  COALESCE(bc.completada_manual, false),
  bc.completada_at,
  COALESCE(bc.placas_no_completadas, 0)::bigint
FROM public.service_boxes sb
LEFT JOIN box_reops br ON br.servicio = sb.servicio AND br.numero_caja = sb.numero_caja
LEFT JOIN box_recups bcr ON bcr.servicio = sb.servicio AND bcr.numero_caja = sb.numero_caja
LEFT JOIN public.box_completion bc ON bc.produccion_id = sb.produccion_id
  AND bc.servicio = sb.servicio AND bc.numero_caja = sb.numero_caja
WHERE sb.produccion_id = p_produccion_id
ORDER BY
  sb.servicio,
  CASE WHEN sb.numero_caja ~ '^[0-9]+$' THEN sb.numero_caja::bigint ELSE NULL END,
  sb.numero_caja;
$$;
