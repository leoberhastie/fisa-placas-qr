/*
# Anular todas las reoperaciones de una placa

1. Changes
- Replaces `anular_reoperacion` (per-row) with `anular_reoperaciones_placa`, which removes every reoperation of one plate in a single atomic step.
- Each removed reoperation is archived in `reoperaciones_anuladas` with the reason, the user and the time.
- One entry is written to `historial_operaciones` per plate.

2. Rules
- Blocked when the plate already has a recovery (recuperación) registered.
- Returns the number of reoperations removed.

3. Security
- SECURITY DEFINER with fixed search_path; callable only by authenticated users.
- The previous function is dropped, so no unused version remains.
*/

DROP FUNCTION IF EXISTS public.anular_reoperacion(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.anular_reoperaciones_placa(
  p_produccion_id uuid,
  p_placa_id uuid,
  p_motivo text,
  p_operador text,
  p_usuario text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reop reoperaciones%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para anular reoperaciones.';
  END IF;

  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Debes indicar el motivo de la anulación.';
  END IF;

  PERFORM 1 FROM placas WHERE id = p_placa_id AND produccion_id = p_produccion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La placa no pertenece a la producción activa.';
  END IF;

  IF EXISTS (SELECT 1 FROM recuperaciones r WHERE r.placa_id = p_placa_id) THEN
    RAISE EXCEPTION 'La placa ya fue recuperada; no se puede anular la reoperación.';
  END IF;

  FOR v_reop IN
    SELECT * FROM reoperaciones
    WHERE placa_id = p_placa_id AND produccion_id = p_produccion_id
    FOR UPDATE
  LOOP
    INSERT INTO reoperaciones_anuladas (
      reoperacion_id, produccion_id, placa_id, proceso, fecha_hora, operador, usuario,
      estado, observaciones, motivo_anulacion, anulada_por
    ) VALUES (
      v_reop.id, v_reop.produccion_id, v_reop.placa_id, v_reop.proceso, v_reop.fecha_hora,
      v_reop.operador, v_reop.usuario, v_reop.estado, v_reop.observaciones,
      p_motivo, coalesce(p_usuario, '')
    );

    DELETE FROM reoperaciones WHERE id = v_reop.id;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'La placa no tiene reoperaciones registradas.';
  END IF;

  INSERT INTO historial_operaciones (
    produccion_id, placa_id, tipo_operacion, proceso, operador, usuario,
    estado_anterior, estado_nuevo, observaciones
  ) VALUES (
    p_produccion_id, p_placa_id, 'anulacion_reoperacion', '',
    coalesce(p_operador, ''), coalesce(p_usuario, ''),
    'pendiente', 'anulada', p_motivo
  );

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anular_reoperaciones_placa(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_reoperaciones_placa(uuid, uuid, text, text, text) TO authenticated;
