/*
# Box completion tracking and marking/reopening RPCs

## Purpose
Implements the "Estados de cajas y servicios" module's persistence layer.
Stores per-box manual completion flags separate from service_boxes (which are
deleted/recreated on re-import). Provides SECURITY DEFINER RPCs for marking
a box completed and reopening it, with validation, historial logging, and
production version bumping.

## New tables
- `box_completion`
  - `id` uuid PK
  - `produccion_id` uuid NOT NULL → productions(id) ON DELETE CASCADE
  - `servicio` text NOT NULL
  - `numero_caja` text NOT NULL
  - `completada_manual` boolean NOT NULL DEFAULT false
  - `completada_at` timestamptz NULL
  - `completada_by` uuid NULL → auth.users(id) ON DELETE SET NULL
  - `created_at` / `updated_at` timestamptz DEFAULT now()
  - UNIQUE(produccion_id, servicio, numero_caja)

## New RPCs (SECURITY DEFINER, search_path=public)
1. `mark_box_completed(p_produccion_id, p_servicio, p_numero_caja)`
   - Validates box exists in service_boxes
   - Rejects if pending reoperations > 0
   - Upserts completada_manual=true, completada_at=now(), completada_by=auth.uid()
   - Logs to historial_operaciones (tipo_operacion='cambio_estado')
   - Bumps productions.version_datos
   - Returns TABLE(estado, completada_manual, completada_at)

2. `reopen_box(p_produccion_id, p_servicio, p_numero_caja)`
   - Validates box exists in service_boxes
   - Rejects if not manually completed
   - Sets completada_manual=false, clears completada_at/by
   - Logs to historial_operaciones
   - Bumps productions.version_datos
   - Returns TABLE(estado, completada_manual, completada_at)

## Security
- RLS enabled on box_completion; SELECT granted to authenticated (completion
  state is not sensitive — all operators can see it).
- No direct INSERT/UPDATE/DELETE grants: only SECURITY DEFINER functions write.
- EXECUTE revoked from PUBLIC/anon on both RPCs; granted to authenticated.

## Box state logic (4 states)
  1. pendientes > 0 → 'con_reoperaciones'
  2. reops > 0, pendientes = 0 → 'completada_ro' (automatic)
  3. completada_manual = true, reops = 0 → 'completada'
  4. otherwise → 'en_proceso'
*/

-- ============================================================
-- 1. box_completion table
-- ============================================================
CREATE TABLE IF NOT EXISTS box_completion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  servicio text NOT NULL,
  numero_caja text NOT NULL,
  completada_manual boolean NOT NULL DEFAULT false,
  completada_at timestamptz,
  completada_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produccion_id, servicio, numero_caja)
);

CREATE INDEX IF NOT EXISTS box_completion_produccion_idx
  ON box_completion (produccion_id);

ALTER TABLE box_completion ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON box_completion TO authenticated;

DROP POLICY IF EXISTS "select_box_completion" ON box_completion;
CREATE POLICY "select_box_completion" ON box_completion FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- 2. mark_box_completed RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_box_completed(
  p_produccion_id uuid,
  p_servicio text,
  p_numero_caja text
) RETURNS TABLE(estado text, completada_manual boolean, completada_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    RAISE EXCEPTION 'Debe iniciar sesión para marcar una caja.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM service_boxes
    WHERE produccion_id = p_produccion_id
      AND servicio = p_servicio
      AND numero_caja = p_numero_caja
  ) INTO v_box_exists;
  IF NOT v_box_exists THEN
    RAISE EXCEPTION 'La caja % del servicio % no existe en esta producción.', p_numero_caja, p_servicio;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE r.estado = 'pendiente')
    INTO v_reops, v_pendientes
  FROM reoperaciones r
  JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  WHERE r.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
    AND p.numero_caja = p_numero_caja;

  IF v_pendientes > 0 THEN
    RAISE EXCEPTION 'No se puede marcar como completada: la caja tiene % reoperacion(es) pendiente(s).', v_pendientes;
  END IF;

  SELECT completada_manual INTO v_current_manual
  FROM box_completion
  WHERE produccion_id = p_produccion_id
    AND servicio = p_servicio
    AND numero_caja = p_numero_caja;

  v_estado_anterior := CASE
    WHEN v_pendientes > 0 THEN 'con_reoperaciones'
    WHEN v_reops > 0 THEN 'completada_ro'
    WHEN COALESCE(v_current_manual, false) THEN 'completada'
    ELSE 'en_proceso'
  END;

  INSERT INTO box_completion (produccion_id, servicio, numero_caja, completada_manual, completada_at, completada_by)
  VALUES (p_produccion_id, p_servicio, p_numero_caja, true, now(), v_uid)
  ON CONFLICT (produccion_id, servicio, numero_caja)
  DO UPDATE SET
    completada_manual = true,
    completada_at = now(),
    completada_by = EXCLUDED.completada_by,
    updated_at = now();

  v_estado_nuevo := CASE
    WHEN v_pendientes > 0 THEN 'con_reoperaciones'
    WHEN v_reops > 0 THEN 'completada_ro'
    ELSE 'completada'
  END;

  SELECT full_name INTO v_usuario FROM profiles WHERE id = v_uid;
  IF v_usuario IS NULL THEN v_usuario := ''; END IF;

  INSERT INTO historial_operaciones (
    produccion_id, placa_id, tipo_operacion, proceso,
    operador, usuario, estado_anterior, estado_nuevo, observaciones
  ) VALUES (
    p_produccion_id, NULL, 'cambio_estado', '',
    '', v_usuario, v_estado_anterior, v_estado_nuevo,
    format('Caja %s del servicio %s marcada como completada', p_numero_caja, p_servicio)
  );

  UPDATE productions
    SET version_datos = version_datos + 1, updated_at = now()
    WHERE id = p_produccion_id;

  RETURN QUERY SELECT v_estado_nuevo, true, now()::timestamptz;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_box_completed(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_box_completed(uuid, text, text) TO authenticated;

-- ============================================================
-- 3. reopen_box RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.reopen_box(
  p_produccion_id uuid,
  p_servicio text,
  p_numero_caja text
) RETURNS TABLE(estado text, completada_manual boolean, completada_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    SELECT 1 FROM service_boxes
    WHERE produccion_id = p_produccion_id
      AND servicio = p_servicio
      AND numero_caja = p_numero_caja
  ) INTO v_box_exists;
  IF NOT v_box_exists THEN
    RAISE EXCEPTION 'La caja % del servicio % no existe en esta producción.', p_numero_caja, p_servicio;
  END IF;

  SELECT completada_manual INTO v_current_manual
  FROM box_completion
  WHERE produccion_id = p_produccion_id
    AND servicio = p_servicio
    AND numero_caja = p_numero_caja;

  IF NOT COALESCE(v_current_manual, false) THEN
    RAISE EXCEPTION 'La caja no está marcada como completada manualmente.';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE r.estado = 'pendiente')
    INTO v_reops, v_pendientes
  FROM reoperaciones r
  JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
  WHERE r.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
    AND p.numero_caja = p_numero_caja;

  v_estado_anterior := CASE
    WHEN v_pendientes > 0 THEN 'con_reoperaciones'
    WHEN v_reops > 0 THEN 'completada_ro'
    ELSE 'completada'
  END;

  UPDATE box_completion
    SET completada_manual = false,
        completada_at = null,
        completada_by = null,
        updated_at = now()
    WHERE produccion_id = p_produccion_id
      AND servicio = p_servicio
      AND numero_caja = p_numero_caja;

  v_estado_nuevo := CASE
    WHEN v_pendientes > 0 THEN 'con_reoperaciones'
    WHEN v_reops > 0 THEN 'completada_ro'
    ELSE 'en_proceso'
  END;

  SELECT full_name INTO v_usuario FROM profiles WHERE id = v_uid;
  IF v_usuario IS NULL THEN v_usuario := ''; END IF;

  INSERT INTO historial_operaciones (
    produccion_id, placa_id, tipo_operacion, proceso,
    operador, usuario, estado_anterior, estado_nuevo, observaciones
  ) VALUES (
    p_produccion_id, NULL, 'cambio_estado', '',
    '', v_usuario, v_estado_anterior, v_estado_nuevo,
    format('Caja %s del servicio %s reabierta', p_numero_caja, p_servicio)
  );

  UPDATE productions
    SET version_datos = version_datos + 1, updated_at = now()
    WHERE id = p_produccion_id;

  RETURN QUERY SELECT v_estado_nuevo, false, NULL::timestamptz;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reopen_box(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_box(uuid, text, text) TO authenticated;
