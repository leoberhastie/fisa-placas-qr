/*
# Cierre de cajas bajo responsabilidad

1. box_completion gana columnas para auditar el cierre con placas no completadas:
   - placas_no_completadas: cantidad de placas que no estaban en placa_completados al cerrar.
   - detalle_no_completadas: jsonb [{serie, posicion}] de esas placas.
2. Nueva RPC list_box_placas_no_completadas: devuelve las placas de la caja sin registro
   de completado.
3. mark_box_completed agrega p_cierre_responsable (default false).
   - Bloqueo duro intacto: reoperaciones pendientes impiden el cierre SIEMPRE.
   - Si hay placas sin completar y p_cierre_responsable = false, lanza excepcion con la lista.
   - Si p_cierre_responsable = true, marca esas placas como completadas, guarda conteo
     y detalle en box_completion, y lo deja en historial_operaciones.
4. get_box_metrics expone placas_no_completadas (conteo registrado al momento del cierre).
*/

ALTER TABLE public.box_completion
  ADD COLUMN IF NOT EXISTS placas_no_completadas integer NOT NULL DEFAULT 0;
ALTER TABLE public.box_completion
  ADD COLUMN IF NOT EXISTS detalle_no_completadas jsonb;

CREATE INDEX IF NOT EXISTS idx_placas_caja_lookup
  ON public.placas (produccion_id, servicio, numero_caja)
  WHERE numero_caja IS NOT NULL;

-- ============================================================
-- RPC: listar placas de la caja sin completado registrado
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_box_placas_no_completadas(
  p_produccion_id uuid,
  p_servicio text,
  p_numero_caja text
)
RETURNS TABLE (placa_id uuid, serie text, posicion text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pl.id, pl.serie, pl.posicion
  FROM public.placas pl
  WHERE pl.produccion_id = p_produccion_id
    AND pl.servicio = p_servicio
    AND pl.numero_caja = p_numero_caja
    AND pl.activo = true
    AND NOT EXISTS (
      SELECT 1 FROM public.placa_completados pc
      WHERE pc.produccion_id = pl.produccion_id
        AND pc.placa_id = pl.id
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_box_placas_no_completadas(uuid, text, text) TO authenticated;

-- ============================================================
-- RPC: marcar caja completada (con cierre bajo responsabilidad)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_box_completed(
  p_produccion_id uuid,
  p_servicio text,
  p_numero_caja text,
  p_cierre_responsable boolean DEFAULT false
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
  v_sin_completar int;
  v_current_manual boolean;
  v_estado_anterior text;
  v_estado_nuevo text;
  v_usuario text;
  v_detalle jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para marcar una caja.';
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

  -- Bloqueo duro: reoperaciones pendientes impiden el cierre siempre.
  SELECT count(*), count(*) FILTER (WHERE r.estado = 'pendiente')
  INTO v_reops, v_pendientes
  FROM public.reoperaciones r
  JOIN public.placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  WHERE r.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
    AND p.numero_caja = p_numero_caja;

  IF v_pendientes > 0 THEN
    RAISE EXCEPTION 'No se puede cerrar la caja: tiene % reoperacion(es) pendiente(s). Debe recuperarlas primero.', v_pendientes;
  END IF;

  -- Placas de la caja sin completado registrado.
  SELECT coalesce(jsonb_agg(jsonb_build_object('serie', pl.serie, 'posicion', pl.posicion) ORDER BY pl.serie, pl.posicion), '[]'::jsonb)
  INTO v_detalle
  FROM public.placas pl
  WHERE pl.produccion_id = p_produccion_id
    AND pl.servicio = p_servicio
    AND pl.numero_caja = p_numero_caja
    AND pl.activo = true
    AND NOT EXISTS (
      SELECT 1 FROM public.placa_completados pc
      WHERE pc.produccion_id = pl.produccion_id
        AND pc.placa_id = pl.id
    );

  v_sin_completar := coalesce(jsonb_array_length(v_detalle), 0);

  IF v_sin_completar > 0 AND p_cierre_responsable IS NOT TRUE THEN
    RAISE EXCEPTION 'La caja tiene % placa(s) sin marcar como completadas. Confirme el cierre bajo su responsabilidad.', v_sin_completar;
  END IF;

  SELECT bc.completada_manual INTO v_current_manual
  FROM public.box_completion bc
  WHERE bc.produccion_id = p_produccion_id
    AND bc.servicio = p_servicio
    AND bc.numero_caja = p_numero_caja;

  v_estado_anterior := CASE
    WHEN v_pendientes > 0 THEN 'con_reoperaciones'
    WHEN v_reops > 0 THEN 'completada_ro'
    WHEN COALESCE(v_current_manual, false) THEN 'completada'
    ELSE 'en_proceso'
  END;

  -- Cierre bajo responsabilidad: marcar las placas faltantes como completadas
  -- para no alterar la contabilidad de la producción.
  IF v_sin_completar > 0 THEN
    INSERT INTO public.placa_completados
      (produccion_id, placa_id, fecha_completado, operador, usuario, servicio, numero_caja, serie, posicion)
    SELECT pl.produccion_id, pl.id, now(), 'Cierre bajo responsabilidad', '',
           pl.servicio, pl.numero_caja, pl.serie, pl.posicion
    FROM public.placas pl
    WHERE pl.produccion_id = p_produccion_id
      AND pl.servicio = p_servicio
      AND pl.numero_caja = p_numero_caja
      AND pl.activo = true
      AND NOT EXISTS (
        SELECT 1 FROM public.placa_completados pc
        WHERE pc.produccion_id = pl.produccion_id
          AND pc.placa_id = pl.id
      )
    ON CONFLICT (produccion_id, placa_id) DO NOTHING;
  END IF;

  INSERT INTO public.box_completion (produccion_id, servicio, numero_caja, completada_manual, completada_at, completada_by, placas_no_completadas, detalle_no_completadas)
  VALUES (p_produccion_id, p_servicio, p_numero_caja, true, now(), v_uid, v_sin_completar, v_detalle)
  ON CONFLICT (produccion_id, servicio, numero_caja)
  DO UPDATE SET
    completada_manual = true,
    completada_at = now(),
    completada_by = EXCLUDED.completada_by,
    placas_no_completadas = EXCLUDED.placas_no_completadas,
    detalle_no_completadas = EXCLUDED.detalle_no_completadas,
    updated_at = now();

  v_estado_nuevo := CASE
    WHEN v_reops > 0 THEN 'completada_ro'
    ELSE 'completada'
  END;

  SELECT pr.full_name INTO v_usuario FROM public.profiles pr WHERE pr.id = v_uid;
  IF v_usuario IS NULL THEN v_usuario := ''; END IF;

  INSERT INTO public.historial_operaciones (
    produccion_id, placa_id, tipo_operacion, proceso,
    operador, usuario, estado_anterior, estado_nuevo, observaciones
  ) VALUES (
    p_produccion_id, NULL, 'cambio_estado', '',
    '', v_usuario, v_estado_anterior, v_estado_nuevo,
    CASE WHEN v_sin_completar > 0
      THEN format('Caja %s del servicio %s cerrada bajo responsabilidad: %s placa(s) sin completar se marcaron como completadas', p_numero_caja, p_servicio, v_sin_completar)
      ELSE format('Caja %s del servicio %s marcada como completada', p_numero_caja, p_servicio)
    END
  );

  UPDATE public.productions
  SET version_datos = version_datos + 1, updated_at = now()
  WHERE id = p_produccion_id;

  RETURN QUERY SELECT v_estado_nuevo, true, now()::timestamptz;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_box_completed(uuid, text, text, boolean) TO authenticated;

-- ============================================================
-- get_box_metrics (recreada con columna adicional)
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
    WHEN COALESCE(br.reops, 0) > 0 THEN 'completada_ro'
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
