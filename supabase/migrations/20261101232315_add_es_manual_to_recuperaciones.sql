ALTER TABLE recuperaciones ADD COLUMN IF NOT EXISTS es_manual boolean NOT NULL DEFAULT false;

UPDATE recuperaciones
SET es_manual = true
WHERE tipo_recuperacion IN (
  'Placa recuperada en inspección',
  'No requiere reoperación',
  'Error de clasificación',
  'Reoperación cancelada'
);