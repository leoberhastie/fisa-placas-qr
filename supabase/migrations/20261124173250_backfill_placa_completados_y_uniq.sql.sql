/*
# Backfill de placa_completados + constraint de unicidad

## 1. Restricción UNIQUE (produccion_id, placa_id)
La tabla no tenía unicidad; el RPC marcar_placa_completada ya protege contra duplicados
por aplicación, pero el constraint hace idempotente el backfill y refuerza la regla.

## 2. Backfill
Producciones elegibles: todas excepto las 3 obsoletas (GNTP, INDEFINIDA, PGJT) y
P10-(030-040) "RO GUANAJUATO" (excluida por pedido).
Regla: placas activas SIN reoperaciones en estado 'pendiente' se marcan como completadas.
Las placas con reoperación pendiente quedan fuera del backfill.

## 3. Cajas completas retroactivas
Si todas las placas activas de una caja quedaron completadas, se registra en
box_completion para que el estado de caja sea consistente con las métricas.

No se insertan filas en historial_operaciones (evita inflar el historial con cientos
de miles de filas retroactivas); placa_completados es el registro fuente.
*/

ALTER TABLE placa_completados
  DROP CONSTRAINT IF EXISTS placa_completados_prod_placa_uniq;

ALTER TABLE placa_completados
  ADD CONSTRAINT placa_completados_prod_placa_uniq UNIQUE (produccion_id, placa_id);

-- ============================================================
-- Backfill de placas completadas
-- ============================================================
INSERT INTO placa_completados
  (produccion_id, placa_id, fecha_completado, operador, usuario, servicio, numero_caja, serie, posicion)
SELECT
  pl.produccion_id,
  pl.id,
  now(),
  'Backfill',
  'sistema',
  pl.servicio,
  pl.numero_caja,
  pl.serie,
  pl.posicion
FROM placas pl
WHERE pl.activo = true
  AND pl.produccion_id IN (
    SELECT id FROM productions
    WHERE id NOT IN (
      'be4dadab-bd4d-4b8c-999c-ccd01e618862'::uuid,  -- GNTP (obsoleta)
      '85a2d202-7d7e-468c-a97f-bd4ae05f53ac'::uuid,  -- INDEFINIDA (obsoleta)
      '41426d7f-a1b3-4dc4-81ae-b3cbed19d9c9'::uuid,  -- PGJT (obsoleta)
      '10d7f528-1b6f-4c2e-8736-85f6f7f16b59'::uuid   -- P10-(030-040) RO GUANAJUATO (excluida)
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM reoperaciones r
    WHERE r.produccion_id = pl.produccion_id
      AND r.placa_id = pl.id
      AND r.estado = 'pendiente'
  )
ON CONFLICT (produccion_id, placa_id) DO NOTHING;

-- ============================================================
-- Cajas cuya totalidad de placas activas quedaron completadas
-- ============================================================
INSERT INTO box_completion (produccion_id, servicio, numero_caja, completada_manual, completada_at, completada_by)
SELECT sb.produccion_id, sb.servicio, sb.numero_caja, true, now(), NULL
FROM service_boxes sb
WHERE sb.produccion_id IN (
    SELECT id FROM productions
    WHERE id NOT IN (
      'be4dadab-bd4d-4b8c-999c-ccd01e618862'::uuid,
      '85a2d202-7d7e-468c-a97f-bd4ae05f53ac'::uuid,
      '41426d7f-a1b3-4dc4-81ae-b3cbed19d9c9'::uuid,
      '10d7f528-1b6f-4c2e-8736-85f6f7f16b59'::uuid
    )
  )
  AND EXISTS (
    SELECT 1 FROM placas pl
    WHERE pl.produccion_id = sb.produccion_id
      AND pl.servicio = sb.servicio
      AND pl.numero_caja = sb.numero_caja
      AND pl.activo = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM placas pl
    WHERE pl.produccion_id = sb.produccion_id
      AND pl.servicio = sb.servicio
      AND pl.numero_caja = sb.numero_caja
      AND pl.activo = true
      AND NOT EXISTS (
        SELECT 1 FROM placa_completados pc
        WHERE pc.produccion_id = pl.produccion_id AND pc.placa_id = pl.id
      )
  )
ON CONFLICT (produccion_id, servicio, numero_caja) DO NOTHING;

-- Bump de versión de datos para refrescar las métricas en el frontend
UPDATE productions
SET version_datos = version_datos + 1
WHERE id IN (
  SELECT DISTINCT produccion_id FROM placa_completados
);
