-- Eliminar 14 recuperaciones duplicadas en la producción 29f63455-903c-49b0-b730-83bb1f01d71a (PRIV_ANTIGUO)
-- Cada placa tenía 2 recuperaciones pero solo 1 reoperación y 1 entrada de historial.
-- El duplicado es siempre el PRIMER registro (rn=1), que se insertó sin historial correspondiente.
-- El segundo registro (rn=2) sí tiene historial y es el legítimo.
-- El operador presionó "Recuperar" dos veces: la primera inserción falló en el historial pero
-- ya había insertado la recuperacion (el trigger marcó la reoperación como completo), el operador
-- reintentó 34 segundos después creando el duplicado.

WITH placas_duplicadas AS (
  SELECT pl.id AS placa_id
  FROM placas pl
  WHERE pl.produccion_id = '29f63455-903c-49b0-b730-83bb1f01d71a'
    AND (SELECT COUNT(*) FROM recuperaciones rc WHERE rc.placa_id = pl.id) > (SELECT COUNT(*) FROM reoperaciones r WHERE r.placa_id = pl.id)
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
