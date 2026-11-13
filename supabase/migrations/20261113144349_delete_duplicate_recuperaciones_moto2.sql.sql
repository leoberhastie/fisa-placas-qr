-- Eliminar 134 recuperaciones duplicadas en MOTO2 (producción 20f9eb0e-1c5d-4259-bc27-ad7dbc3c58e8)
-- Mismo patrón que PRIV_ANTIGUO: el primer registro de cada par no tiene entrada en el historial.
-- Se excluye LT3Z2H que tiene 1 reoperación + 1 reoperación anulada = 2 recuperaciones legítimas.
-- PRIV AUTOMOVIL y Camiones Priv no tienen duplicados.

WITH placas_duplicadas AS (
  SELECT pl.id AS placa_id
  FROM placas pl
  WHERE pl.produccion_id IN ('4a42808f-45da-40d4-ad44-eae50b548407','5a3f7578-b169-48fb-937c-9457097314c9','20f9eb0e-1c5d-4259-bc27-ad7dbc3c58e8')
    AND (SELECT COUNT(*) FROM recuperaciones rc WHERE rc.placa_id = pl.id)
      > ((SELECT COUNT(*) FROM reoperaciones r WHERE r.placa_id = pl.id)
       + (SELECT COUNT(*) FROM reoperaciones_anuladas ra WHERE ra.placa_id = pl.id))
),
duplicados_a_eliminar AS (
  SELECT rc.id
  FROM recuperaciones rc
  WHERE rc.placa_id IN (SELECT placa_id FROM placas_duplicadas)
    AND NOT EXISTS (
      SELECT 1 FROM historial_operaciones h
      WHERE h.placa_id = rc.placa_id
        AND h.tipo_operacion = 'recuperacion'
        AND h.fecha_hora >= rc.fecha_hora - interval '2 seconds'
        AND h.fecha_hora <= rc.fecha_hora + interval '2 seconds'
    )
)
DELETE FROM recuperaciones
WHERE id IN (SELECT id FROM duplicados_a_eliminar);
