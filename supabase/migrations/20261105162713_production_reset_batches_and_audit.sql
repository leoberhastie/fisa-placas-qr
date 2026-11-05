/*
# Production reset in batches with audit log

## Plain-English summary
Replaces the single all-or-nothing reset with two reset modes that run in
small batches. Every reset is recorded (who, when, mode, how many records
were removed per step). Each batch is verified before the next one starts,
and the reset is only marked complete after a final check finds nothing left.

## 1. New table
- `reinicios_produccion`: one row per reset run.
  - `produccion_id`, `modo` ('total' | 'movimientos'), `estado` ('en_curso' | 'completado')
  - `usuario_id`, `usuario_email` (who ran it), `iniciado_at`, `completado_at`
  - `resumen` (jsonb): records removed or updated per step

## 2. Reset modes
- total: removes reoperaciones, recuperaciones, historial, completed boxes,
  registered boxes, production services, import logs and placas.
- movimientos: removes reoperaciones, recuperaciones, historial, completed
  boxes and registered boxes; clears the box of every placa and sets every
  placa back to active. Series, services and import logs are kept.

## 3. New functions
- `start_production_reset(produccion_id, modo)`: creates the log row and returns its id.
- `reset_production_batch(reinicio_id, paso, tamano)`: processes one batch of one
  step and returns how many rows it changed and whether rows remain.
- `finish_production_reset(reinicio_id)`: re-checks every step of the mode; raises
  if anything remains, otherwise marks the run complete and bumps the production
  version so open clients reload.
- Helpers: `reset_production_steps(modo)` and `reset_step_has_pending(produccion_id, paso)`.

## 4. Removed
- `reset_production_data(uuid)`, replaced by the batched flow above.

## 5. Security
- RLS enabled on `reinicios_produccion`. Authenticated admins can read it
  (SELECT policy). No client insert, update or delete: rows are written only by
  the SECURITY DEFINER functions.
- All three entry functions check `current_user_role() = 'admin'`.
- EXECUTE revoked from PUBLIC and anon; granted to authenticated for the entry points.
- Helper functions are not callable by clients.

## 6. Performance
- Partial index on `placas` for rows that still carry a box or are inactive,
  so the movimientos mode only scans rows that need changes.

## Important notes
1. Each batch is its own transaction. If the connection drops mid-run, the
   partial progress is kept and running the reset again continues where it stopped.
2. The final verification guarantees no pending rows remain for the mode.
*/

CREATE TABLE IF NOT EXISTS public.reinicios_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES public.productions(id),
  modo text NOT NULL CHECK (modo IN ('total', 'movimientos')),
  estado text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'completado')),
  usuario_id uuid REFERENCES auth.users(id),
  usuario_email text NOT NULL DEFAULT '',
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  completado_at timestamptz
);

CREATE INDEX IF NOT EXISTS reinicios_produccion_produccion_idx
  ON public.reinicios_produccion (produccion_id, iniciado_at DESC);

CREATE INDEX IF NOT EXISTS placas_produccion_movimiento_idx
  ON public.placas (produccion_id)
  WHERE numero_caja <> '' OR activo = false;

ALTER TABLE public.reinicios_produccion ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.reinicios_produccion TO authenticated;

DROP POLICY IF EXISTS "admin_select_reinicios_produccion" ON public.reinicios_produccion;
CREATE POLICY "admin_select_reinicios_produccion"
ON public.reinicios_produccion FOR SELECT
TO authenticated
USING (current_user_role() = 'admin');

CREATE OR REPLACE FUNCTION public.reset_production_steps(p_modo text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_modo
    WHEN 'total' THEN ARRAY['reoperaciones', 'recuperaciones', 'historial', 'cajas_completadas', 'cajas_registradas', 'servicios', 'importaciones', 'placas']
    WHEN 'movimientos' THEN ARRAY['reoperaciones', 'recuperaciones', 'historial', 'cajas_completadas', 'cajas_registradas', 'placas_caja']
    ELSE ARRAY[]::text[]
  END
$$;

CREATE OR REPLACE FUNCTION public.reset_step_has_pending(p_produccion_id uuid, p_paso text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE p_paso
    WHEN 'reoperaciones' THEN EXISTS (SELECT 1 FROM reoperaciones WHERE produccion_id = p_produccion_id)
    WHEN 'recuperaciones' THEN EXISTS (SELECT 1 FROM recuperaciones WHERE produccion_id = p_produccion_id)
    WHEN 'historial' THEN EXISTS (SELECT 1 FROM historial_operaciones WHERE produccion_id = p_produccion_id)
    WHEN 'cajas_completadas' THEN EXISTS (SELECT 1 FROM box_completion WHERE produccion_id = p_produccion_id)
    WHEN 'cajas_registradas' THEN EXISTS (SELECT 1 FROM service_boxes WHERE produccion_id = p_produccion_id)
    WHEN 'servicios' THEN EXISTS (SELECT 1 FROM production_services WHERE produccion_id = p_produccion_id)
    WHEN 'importaciones' THEN EXISTS (SELECT 1 FROM importaciones WHERE produccion_id = p_produccion_id)
    WHEN 'placas' THEN EXISTS (SELECT 1 FROM placas WHERE produccion_id = p_produccion_id)
    WHEN 'placas_caja' THEN EXISTS (
      SELECT 1 FROM placas
      WHERE produccion_id = p_produccion_id AND (numero_caja <> '' OR activo = false)
    )
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION public.start_production_reset(p_produccion_id uuid, p_modo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  IF current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede reiniciar los datos de una producción.';
  END IF;

  IF p_modo NOT IN ('total', 'movimientos') THEN
    RAISE EXCEPTION 'Tipo de reinicio no válido.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM productions WHERE id = p_produccion_id) THEN
    RAISE EXCEPTION 'La producción no existe.';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();

  INSERT INTO reinicios_produccion (produccion_id, modo, usuario_id, usuario_email)
  VALUES (p_produccion_id, p_modo, auth.uid(), COALESCE(v_email, ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_production_batch(p_reinicio_id uuid, p_paso text, p_tamano integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reinicio reinicios_produccion%ROWTYPE;
  v_tamano integer;
  v_procesados integer;
  v_pendientes boolean;
BEGIN
  IF current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede reiniciar los datos de una producción.';
  END IF;

  SELECT * INTO v_reinicio FROM reinicios_produccion WHERE id = p_reinicio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El reinicio no existe.';
  END IF;
  IF v_reinicio.estado <> 'en_curso' THEN
    RAISE EXCEPTION 'Este reinicio ya fue completado.';
  END IF;
  IF NOT (p_paso = ANY (public.reset_production_steps(v_reinicio.modo))) THEN
    RAISE EXCEPTION 'Paso de reinicio no válido para este tipo de reinicio.';
  END IF;

  v_tamano := LEAST(GREATEST(COALESCE(p_tamano, 2000), 100), 10000);

  IF p_paso = 'reoperaciones' THEN
    DELETE FROM reoperaciones WHERE id IN (
      SELECT id FROM reoperaciones WHERE produccion_id = v_reinicio.produccion_id LIMIT v_tamano
    );
  ELSIF p_paso = 'recuperaciones' THEN
    DELETE FROM recuperaciones WHERE id IN (
      SELECT id FROM recuperaciones WHERE produccion_id = v_reinicio.produccion_id LIMIT v_tamano
    );
  ELSIF p_paso = 'historial' THEN
    DELETE FROM historial_operaciones WHERE id IN (
      SELECT id FROM historial_operaciones WHERE produccion_id = v_reinicio.produccion_id LIMIT v_tamano
    );
  ELSIF p_paso = 'cajas_completadas' THEN
    DELETE FROM box_completion WHERE id IN (
      SELECT id FROM box_completion WHERE produccion_id = v_reinicio.produccion_id LIMIT v_tamano
    );
  ELSIF p_paso = 'cajas_registradas' THEN
    DELETE FROM service_boxes WHERE id IN (
      SELECT id FROM service_boxes WHERE produccion_id = v_reinicio.produccion_id LIMIT v_tamano
    );
  ELSIF p_paso = 'servicios' THEN
    DELETE FROM production_services WHERE id IN (
      SELECT id FROM production_services WHERE produccion_id = v_reinicio.produccion_id LIMIT v_tamano
    );
  ELSIF p_paso = 'importaciones' THEN
    DELETE FROM importaciones WHERE id IN (
      SELECT id FROM importaciones WHERE produccion_id = v_reinicio.produccion_id LIMIT v_tamano
    );
  ELSIF p_paso = 'placas' THEN
    DELETE FROM placas WHERE id IN (
      SELECT id FROM placas WHERE produccion_id = v_reinicio.produccion_id LIMIT v_tamano
    );
  ELSIF p_paso = 'placas_caja' THEN
    UPDATE placas SET numero_caja = '', activo = true WHERE id IN (
      SELECT id FROM placas
      WHERE produccion_id = v_reinicio.produccion_id AND (numero_caja <> '' OR activo = false)
      LIMIT v_tamano
    );
  END IF;

  GET DIAGNOSTICS v_procesados = ROW_COUNT;
  v_pendientes := public.reset_step_has_pending(v_reinicio.produccion_id, p_paso);

  UPDATE reinicios_produccion
  SET resumen = jsonb_set(
    resumen,
    ARRAY[p_paso],
    to_jsonb(COALESCE((resumen ->> p_paso)::integer, 0) + v_procesados),
    true
  )
  WHERE id = p_reinicio_id;

  RETURN jsonb_build_object('procesados', v_procesados, 'pendientes', v_pendientes);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_production_reset(p_reinicio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reinicio reinicios_produccion%ROWTYPE;
  v_paso text;
BEGIN
  IF current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede reiniciar los datos de una producción.';
  END IF;

  SELECT * INTO v_reinicio FROM reinicios_produccion WHERE id = p_reinicio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El reinicio no existe.';
  END IF;
  IF v_reinicio.estado <> 'en_curso' THEN
    RAISE EXCEPTION 'Este reinicio ya fue completado.';
  END IF;

  FOREACH v_paso IN ARRAY public.reset_production_steps(v_reinicio.modo) LOOP
    IF public.reset_step_has_pending(v_reinicio.produccion_id, v_paso) THEN
      RAISE EXCEPTION 'Quedaron registros pendientes en el paso %. Vuelve a intentar el reinicio.', v_paso;
    END IF;
  END LOOP;

  UPDATE productions SET version_datos = version_datos + 1 WHERE id = v_reinicio.produccion_id;

  UPDATE reinicios_produccion
  SET estado = 'completado', completado_at = now()
  WHERE id = p_reinicio_id;

  RETURN v_reinicio.resumen;
END;
$$;

DROP FUNCTION IF EXISTS public.reset_production_data(uuid);

REVOKE EXECUTE ON FUNCTION public.reset_production_steps(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_step_has_pending(uuid, text) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.start_production_reset(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_production_batch(uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finish_production_reset(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_production_reset(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_production_batch(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_production_reset(uuid) TO authenticated;
