import { supabase } from '@/lib/supabase';

export type ProductionResetMode = 'total' | 'movimientos';

export type ResetStepStatus = 'pendiente' | 'en_curso' | 'verificado';

export interface ResetStepProgress {
  key: string;
  label: string;
  status: ResetStepStatus;
  eliminados: number;
  lotes: number;
}

export interface ProductionResetRecord {
  id: string;
  modo: ProductionResetMode;
  estado: 'en_curso' | 'completado';
  usuario_email: string;
  resumen: Record<string, number>;
  iniciado_at: string;
  completado_at: string | null;
}

export const RESET_MODE_STEPS: Record<ProductionResetMode, string[]> = {
  total: ['reoperaciones', 'recuperaciones', 'historial', 'cajas_completadas', 'cajas_registradas', 'servicios', 'importaciones', 'placas'],
  movimientos: ['reoperaciones', 'recuperaciones', 'historial', 'cajas_completadas', 'cajas_registradas', 'placas_caja'],
};

export const RESET_STEP_LABELS: Record<string, string> = {
  reoperaciones: 'Reoperaciones',
  recuperaciones: 'Recuperaciones',
  historial: 'Historial de operaciones',
  cajas_completadas: 'Cajas completadas',
  cajas_registradas: 'Cajas registradas',
  servicios: 'Servicios de la producción',
  importaciones: 'Registros de importación',
  placas: 'Placas',
  placas_caja: 'Caja asignada a cada placa',
};

const DEFAULT_BATCH_SIZE = 2000;
const PLACA_BATCH_SIZE = 5000;

const BATCH_SIZE_BY_STEP: Record<string, number> = {
  placas: PLACA_BATCH_SIZE,
  placas_caja: PLACA_BATCH_SIZE,
};

const RESET_RECORD_COLUMNS = 'id, modo, estado, usuario_email, resumen, iniciado_at, completado_at';

async function startProductionReset(produccionId: string, modo: ProductionResetMode): Promise<string> {
  const { data, error } = await supabase.rpc('start_production_reset', {
    p_produccion_id: produccionId,
    p_modo: modo,
  });
  if (error || typeof data !== 'string') {
    throw new Error(error?.message || 'No se pudo iniciar el reinicio de la producción.');
  }
  return data;
}

async function runResetBatch(
  reinicioId: string,
  paso: string,
): Promise<{ procesados: number; pendientes: boolean }> {
  const { data, error } = await supabase.rpc('reset_production_batch', {
    p_reinicio_id: reinicioId,
    p_paso: paso,
    p_tamano: BATCH_SIZE_BY_STEP[paso] ?? DEFAULT_BATCH_SIZE,
  });
  if (error || !data || typeof data !== 'object') {
    throw new Error(error?.message || `No se pudo procesar el paso "${RESET_STEP_LABELS[paso]}".`);
  }
  const result = data as { procesados?: unknown; pendientes?: unknown };
  return {
    procesados: Number(result.procesados ?? 0),
    pendientes: Boolean(result.pendientes),
  };
}

async function finishProductionReset(reinicioId: string): Promise<void> {
  const { error } = await supabase.rpc('finish_production_reset', { p_reinicio_id: reinicioId });
  if (error) throw new Error(error.message || 'No se pudo cerrar el reinicio de la producción.');
}

export function buildInitialResetSteps(modo: ProductionResetMode): ResetStepProgress[] {
  return RESET_MODE_STEPS[modo].map((key) => ({
    key,
    label: RESET_STEP_LABELS[key],
    status: 'pendiente',
    eliminados: 0,
    lotes: 0,
  }));
}

export async function runProductionReset(
  produccionId: string,
  modo: ProductionResetMode,
  onChange: (steps: ResetStepProgress[]) => void,
): Promise<void> {
  const steps = buildInitialResetSteps(modo);
  const reinicioId = await startProductionReset(produccionId, modo);
  onChange(steps.map((step) => ({ ...step })));

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    step.status = 'en_curso';
    onChange(steps.map((s) => ({ ...s })));

    let pendientes = true;
    while (pendientes) {
      const result = await runResetBatch(reinicioId, step.key);
      if (result.procesados === 0 && result.pendientes) {
        throw new Error(`El paso "${step.label}" no avanzó. Vuelve a intentar el reinicio.`);
      }
      step.eliminados += result.procesados;
      step.lotes += 1;
      pendientes = result.pendientes;
      onChange(steps.map((s) => ({ ...s })));
    }

    step.status = 'verificado';
    onChange(steps.map((s) => ({ ...s })));
  }

  await finishProductionReset(reinicioId);
}

export async function listProductionResets(produccionId: string): Promise<ProductionResetRecord[]> {
  const { data, error } = await supabase
    .from('reinicios_produccion')
    .select(RESET_RECORD_COLUMNS)
    .eq('produccion_id', produccionId)
    .order('iniciado_at', { ascending: false })
    .limit(20);
  if (error || !Array.isArray(data)) throw new Error('No se pudo cargar el registro de reinicios.');
  return data as ProductionResetRecord[];
}
