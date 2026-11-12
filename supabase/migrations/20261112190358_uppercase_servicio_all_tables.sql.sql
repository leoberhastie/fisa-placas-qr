-- Convertir la columna servicio/nombre a MAYÚSCULAS en todas las tablas relacionadas.
-- Las relaciones entre tablas son por UUIDs (produccion_id, placa_id), no por el texto del servicio,
-- por lo que cambiar el texto a mayúsculas no afecta las foreign keys.

-- 1. placas.servicio
UPDATE placas
SET servicio = UPPER(servicio)
WHERE servicio IS NOT NULL AND servicio != '' AND servicio != UPPER(servicio);

-- 2. service_boxes.servicio
UPDATE service_boxes
SET servicio = UPPER(servicio)
WHERE servicio IS NOT NULL AND servicio != '' AND servicio != UPPER(servicio);

-- 3. box_completion.servicio
UPDATE box_completion
SET servicio = UPPER(servicio)
WHERE servicio IS NOT NULL AND servicio != '' AND servicio != UPPER(servicio);

-- 4. production_services.nombre
UPDATE production_services
SET nombre = UPPER(nombre)
WHERE nombre IS NOT NULL AND nombre != '' AND nombre != UPPER(nombre);

-- 5. reoperaciones.proceso ya usa valores fijos (Impresion, Sticker, etc.) — no es servicio.
-- 6. historial_operaciones no tiene columna servicio.
