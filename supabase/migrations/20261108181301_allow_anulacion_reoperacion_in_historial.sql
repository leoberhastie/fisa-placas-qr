ALTER TABLE public.historial_operaciones DROP CONSTRAINT IF EXISTS historial_operaciones_tipo_operacion_check;

ALTER TABLE public.historial_operaciones
  ADD CONSTRAINT historial_operaciones_tipo_operacion_check
  CHECK (tipo_operacion IN ('', 'reoperacion', 'recuperacion', 'importacion', 'cambio_estado', 'edicion_placa', 'anulacion_reoperacion'));