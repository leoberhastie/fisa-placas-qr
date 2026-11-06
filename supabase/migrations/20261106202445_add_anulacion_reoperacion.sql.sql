/*
# Anular reoperación registrada por error

1. New Tables
- `reoperaciones_anuladas`: audit archive of reoperations that were removed by mistake.
  Stores a full copy of the original row plus the reason (`motivo_anulacion`), who removed it (`anulada_por`) and when (`anulada_at`).

2. New Functions
- `anular_reoperacion(p_reoperacion_id, p_motivo, p_operador, p_usuario)`: moves a reoperation into the archive and removes it from the active `reoperaciones` table, so every existing metric, report and list stops counting it.
  - Blocked when the plate already has a recovery (recuperación) registered.
  - Writes an entry in `historial_operaciones`.

3. Security
- RLS enabled on `reoperaciones_anuladas`; authenticated users can only SELECT it.
- No direct write access to the archive: writes happen only through `anular_reoperacion`.
- `anular_reoperacion` runs as SECURITY DEFINER with a fixed search_path, is callable only by authenticated users, and is not callable by PUBLIC or anon.

# Notes
1. Removal is a move, not a loss: the original data is preserved in `reoperaciones_anuladas`.
2. The function requires a signed-in user (auth.uid() must be set).
*/

CREATE TABLE IF NOT EXISTS reoperaciones_anuladas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reoperacion_id uuid NOT NULL,
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid REFERENCES placas(id) ON DELETE SET NULL,
  proceso text NOT NULL DEFAULT '',
  fecha_hora timestamptz NOT NULL,
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT '',
  observaciones text NOT NULL DEFAULT '',
  motivo_anulacion text NOT NULL,
  anulada_por text NOT NULL DEFAULT '',
  anulada_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reoperaciones_anuladas_produccion_id_idx ON reoperaciones_anuladas (produccion_id);

ALTER TABLE reoperaciones_anuladas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON reoperaciones_anuladas TO authenticated;

DROP POLICY IF EXISTS "select_reoperaciones_anuladas" ON reoperaciones_anuladas;
CREATE POLICY "select_reoperaciones_anuladas" ON reoperaciones_anuladas FOR SELECT
  TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.anular_reoperacion(
  p_reoperacion_id uuid,
  p_motivo text,
  p_operador text,
  p_usuario text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reop reoperaciones%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para anular una reoperación.';
  END IF;

  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Debes indicar el motivo de la anulación.';
  END IF;

  SELECT * INTO v_reop FROM reoperaciones WHERE id = p_reoperacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reoperación ya no existe.';
  END IF;

  IF v_reop.placa_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM recuperaciones r WHERE r.placa_id = v_reop.placa_id
  ) THEN
    RAISE EXCEPTION 'La placa ya fue recuperada; no se puede anular la reoperación.';
  END IF;

  INSERT INTO reoperaciones_anuladas (
    reoperacion_id, produccion_id, placa_id, proceso, fecha_hora, operador, usuario,
    estado, observaciones, motivo_anulacion, anulada_por
  ) VALUES (
    v_reop.id, v_reop.produccion_id, v_reop.placa_id, v_reop.proceso, v_reop.fecha_hora,
    v_reop.operador, v_reop.usuario, v_reop.estado, v_reop.observaciones,
    p_motivo, coalesce(p_usuario, '')
  );

  DELETE FROM reoperaciones WHERE id = v_reop.id;

  INSERT INTO historial_operaciones (
    produccion_id, placa_id, tipo_operacion, proceso, operador, usuario,
    estado_anterior, estado_nuevo, observaciones
  ) VALUES (
    v_reop.produccion_id, v_reop.placa_id, 'anulacion_reoperacion', v_reop.proceso,
    coalesce(p_operador, ''), coalesce(p_usuario, ''),
    v_reop.estado, 'anulada', p_motivo
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anular_reoperacion(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_reoperacion(uuid, text, text, text) TO authenticated;
