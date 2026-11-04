import { supabase } from '@/lib/supabase';
import type { Placa, PlatePosition, Reoperation, Recuperacion, HistorialOperacion } from '@/types/domain';

const PLACA_COLUMNS =
  'id, produccion_id, consecutivo, serie, posicion, servicio, numero_caja, fecha_importacion, activo';

const REOPERACION_COLUMNS =
  'id, produccion_id, placa_id, proceso, fecha_hora, operador, usuario, estado, observaciones';

const RECUPERACION_COLUMNS =
  'id, produccion_id, placa_id, fecha_hora, operador, usuario, tipo_recuperacion, observaciones, es_manual';

const HISTORIAL_COLUMNS =
  'id, produccion_id, placa_id, tipo_operacion, proceso, fecha_hora, operador, usuario, estado_anterior, estado_nuevo, observaciones';

const PAGE_SIZE = 1000;

// The API returns at most PAGE_SIZE rows per request, so larger lists must be read page by page.
async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  errorMessage: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(errorMessage);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// =========================================================
// PLACAS
// =========================================================

export async function listPlacasByProduction(produccionId: string): Promise<Placa[]> {
  return fetchAllPages<Placa>(
    (from, to) =>
      supabase
        .from('placas')
        .select(PLACA_COLUMNS)
        .eq('produccion_id', produccionId)
        .order('consecutivo', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    'No se pudieron cargar las placas.',
  );
}

export async function findPlaca(
  produccionId: string,
  serie: string,
  posicion: PlatePosition,
): Promise<Placa | null> {
  const { data, error } = await supabase
    .from('placas')
    .select(PLACA_COLUMNS)
    .eq('produccion_id', produccionId)
    .eq('serie', serie)
    .eq('posicion', posicion)
    .maybeSingle();
  if (error) throw new Error('No se pudo buscar la placa.');
  return (data as Placa) ?? null;
}

// =========================================================
// REOPERACIONES
// =========================================================

export interface ReoperationInput {
  produccion_id: string;
  placa_id: string | null;
  proceso: string;
  operador: string;
  usuario: string;
  estado: string;
  observaciones: string;
}

export async function listReoperacionesByProduction(produccionId: string): Promise<Reoperation[]> {
  return fetchAllPages<Reoperation>(
    (from, to) =>
      supabase
        .from('reoperaciones')
        .select(REOPERACION_COLUMNS)
        .eq('produccion_id', produccionId)
        .order('fecha_hora', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    'No se pudieron cargar las reoperaciones.',
  );
}

export async function createReoperation(input: ReoperationInput): Promise<Reoperation> {
  const { data, error } = await supabase
    .from('reoperaciones')
    .insert({
      produccion_id: input.produccion_id,
      placa_id: input.placa_id,
      proceso: input.proceso,
      operador: input.operador,
      usuario: input.usuario,
      estado: input.estado,
      observaciones: input.observaciones,
    })
    .select(REOPERACION_COLUMNS)
    .single();
  if (error) throw new Error('No se pudo registrar la reoperación.');
  return data as Reoperation;
}

export async function updateReoperationEstado(
  reoperacionId: string,
  nuevoEstado: string,
): Promise<void> {
  const { error } = await supabase
    .from('reoperaciones')
    .update({ estado: nuevoEstado })
    .eq('id', reoperacionId);
  if (error) throw new Error('No se pudo actualizar el estado de la reoperación.');
}

export async function getReoperacionById(
  reoperacionId: string,
): Promise<Reoperation | null> {
  const { data, error } = await supabase
    .from('reoperaciones')
    .select(REOPERACION_COLUMNS)
    .eq('id', reoperacionId)
    .maybeSingle();
  if (error) throw new Error('No se pudo cargar la reoperación.');
  return (data as Reoperation) ?? null;
}

export interface CierreManualInput {
  reoperacionId: string;
  produccion_id: string;
  placa_id: string | null;
  operador: string;
  usuario: string;
  motivo: string;
  tipo_recuperacion: string;
}

/**
 * Cierre manual: marks a pending reoperation as RECUPERADA, registers a
 * recuperacion record, and logs the operation in historial. Does NOT delete
 * the original reoperation — it stays as historical.
 */
export async function cerrarReoperacionManual(input: CierreManualInput): Promise<void> {
  const { error: updErr } = await supabase
    .from('reoperaciones')
    .update({ estado: 'completo' })
    .eq('id', input.reoperacionId);
  if (updErr) throw new Error('No se pudo actualizar el estado de la reoperación.');

  const { error: recErr } = await supabase.from('recuperaciones').insert({
    produccion_id: input.produccion_id,
    placa_id: input.placa_id,
    operador: input.operador,
    usuario: input.usuario,
    tipo_recuperacion: input.tipo_recuperacion,
    observaciones: input.motivo,
    es_manual: true,
  });
  if (recErr) throw new Error('No se pudo registrar la recuperación.');

  const { error: histErr } = await supabase.from('historial_operaciones').insert({
    produccion_id: input.produccion_id,
    placa_id: input.placa_id,
    tipo_operacion: 'recuperacion',
    proceso: '',
    operador: input.operador,
    usuario: input.usuario,
    estado_anterior: 'pendiente',
    estado_nuevo: 'completo',
    observaciones: input.motivo,
  });
  if (histErr) throw new Error('No se pudo registrar en el historial.');
}

// =========================================================
// RECUPERACIONES
// =========================================================

export interface RecuperacionInput {
  produccion_id: string;
  placa_id: string | null;
  operador: string;
  usuario: string;
  tipo_recuperacion: string;
  observaciones: string;
}

export async function listRecuperacionesByProduction(produccionId: string): Promise<Recuperacion[]> {
  return fetchAllPages<Recuperacion>(
    (from, to) =>
      supabase
        .from('recuperaciones')
        .select(RECUPERACION_COLUMNS)
        .eq('produccion_id', produccionId)
        .order('fecha_hora', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    'No se pudieron cargar las recuperaciones.',
  );
}

export async function createRecuperacion(input: RecuperacionInput): Promise<Recuperacion> {
  if (input.placa_id) {
    const { error: closeErr } = await supabase
      .from('reoperaciones')
      .update({ estado: 'completo' })
      .eq('placa_id', input.placa_id)
      .eq('estado', 'pendiente');
    if (closeErr) throw new Error('No se pudo actualizar la incidencia de la placa.');
  }
  const { data, error } = await supabase
    .from('recuperaciones')
    .insert({
      produccion_id: input.produccion_id,
      placa_id: input.placa_id,
      operador: input.operador,
      usuario: input.usuario,
      tipo_recuperacion: input.tipo_recuperacion,
      observaciones: input.observaciones,
    })
    .select(RECUPERACION_COLUMNS)
    .single();
  if (error) throw new Error('No se pudo registrar la recuperación.');
  return data as Recuperacion;
}

// =========================================================
// HISTORIAL
// =========================================================

export interface HistorialInput {
  produccion_id: string;
  placa_id: string | null;
  tipo_operacion: string;
  proceso: string;
  operador: string;
  usuario: string;
  estado_anterior: string;
  estado_nuevo: string;
  observaciones: string;
}

export async function listHistorialByProduction(produccionId: string): Promise<HistorialOperacion[]> {
  return fetchAllPages<HistorialOperacion>(
    (from, to) =>
      supabase
        .from('historial_operaciones')
        .select(HISTORIAL_COLUMNS)
        .eq('produccion_id', produccionId)
        .order('fecha_hora', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    'No se pudo cargar el historial.',
  );
}

export async function listHistorialByPlaca(placaId: string): Promise<HistorialOperacion[]> {
  const { data, error } = await supabase
    .from('historial_operaciones')
    .select(HISTORIAL_COLUMNS)
    .eq('placa_id', placaId)
    .order('fecha_hora', { ascending: false });
  if (error) throw new Error('No se pudo cargar el historial de la placa.');
  return (data ?? []) as HistorialOperacion[];
}

export async function insertHistorial(input: HistorialInput): Promise<void> {
  const { error } = await supabase.from('historial_operaciones').insert({
    produccion_id: input.produccion_id,
    placa_id: input.placa_id,
    tipo_operacion: input.tipo_operacion,
    proceso: input.proceso,
    operador: input.operador,
    usuario: input.usuario,
    estado_anterior: input.estado_anterior,
    estado_nuevo: input.estado_nuevo,
    observaciones: input.observaciones,
  });
  if (error) throw new Error('No se pudo registrar en el historial.');
}
