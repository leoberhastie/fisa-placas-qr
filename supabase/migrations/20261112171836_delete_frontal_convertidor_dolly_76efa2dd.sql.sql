-- Eliminar placas FRONTAL del servicio 'Convertidor Dolly' de la producción 76efa2dd-9349-4bd3-b276-c6ae25bb65d5
-- Estas placas se cargaron por error (JGS cuando en realidad son PZ: solo TRASERA).
-- Orden: dependencias primero (historial, recuperaciones, reoperaciones, anuladas), luego placas.

-- 1. Eliminar historial_operaciones vinculado a las placas FRONTAL
DELETE FROM historial_operaciones
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND placa_id IN (
    SELECT id FROM placas
    WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
      AND servicio = 'Convertidor Dolly'
      AND posicion = 'FRONTAL'
  );

-- 2. Eliminar recuperaciones vinculadas a las placas FRONTAL
DELETE FROM recuperaciones
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND placa_id IN (
    SELECT id FROM placas
    WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
      AND servicio = 'Convertidor Dolly'
      AND posicion = 'FRONTAL'
  );

-- 3. Eliminar reoperaciones_anuladas vinculadas a las placas FRONTAL
DELETE FROM reoperaciones_anuladas
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND placa_id IN (
    SELECT id FROM placas
    WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
      AND servicio = 'Convertidor Dolly'
      AND posicion = 'FRONTAL'
  );

-- 4. Eliminar reoperaciones vinculadas a las placas FRONTAL
DELETE FROM reoperaciones
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND placa_id IN (
    SELECT id FROM placas
    WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
      AND servicio = 'Convertidor Dolly'
      AND posicion = 'FRONTAL'
  );

-- 5. Eliminar las placas FRONTAL
DELETE FROM placas
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND servicio = 'Convertidor Dolly'
  AND posicion = 'FRONTAL';
