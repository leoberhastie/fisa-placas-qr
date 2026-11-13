-- Eliminar reoperación errónea de placa 81-ESS-05 TRASERA en PRIV AUTOBUS
-- La reoperación de Blanking (21:52:02) fue registrada 54 segundos después
-- de la de Impresion (21:51:08), claramente un error del operador.
-- Como la placa ya tiene una recuperación, no se puede usar anular_reoperaciones_placa.
-- Se mueve el registro a reoperaciones_anuladas y se elimina de reoperaciones + historial.

INSERT INTO reoperaciones_anuladas (
  reoperacion_id, produccion_id, placa_id, proceso, fecha_hora, operador, usuario,
  estado, observaciones, motivo_anulacion, anulada_por
)
SELECT
  r.id, r.produccion_id, r.placa_id, r.proceso, r.fecha_hora, r.operador, r.usuario,
  r.estado, r.observaciones,
  'Placa marcada por duplicado',
  'migracion-manual'
FROM reoperaciones r
WHERE r.id = '5824858a-b12c-4b75-9e8d-7cca7df608f1';

DELETE FROM reoperaciones WHERE id = '5824858a-b12c-4b75-9e8d-7cca7df608f1';

DELETE FROM historial_operaciones
WHERE placa_id = 'f2cc41d5-ebaa-4952-80e7-6e4988ee38e8'
  AND tipo_operacion = 'reoperacion'
  AND proceso = 'Blanking'
  AND fecha_hora >= '2026-11-07 21:51:00'
  AND fecha_hora <= '2026-11-07 21:53:00';
