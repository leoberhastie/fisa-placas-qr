import { supabase } from '@/lib/supabase';
import type { MetricStatus, ServiceType } from '@/lib/metricsTypes';
import { percent, type BoxMetrics, type ServiceMetrics } from '@/lib/operationMetrics';
import type { PlacaMovementRow } from '@/lib/placaMovements';

export interface ProductionMetrics {
  totalPlacas: number;
  placasAfectadas: number;
  placasConPendientes: number;
  porcentajePlacasAfectadas: number;
  totalReoperaciones: number;
  reoperacionesPendientes: number;
  totalRecuperaciones: number;
  porcentajeRecuperacion: number;
  cajasConReoperaciones: number;
  cajasPendientes: number;
  cajasCompletas: number;
  cajasEnProceso: number;
  cajasCompletadasRo: number;
  serviciosConReoperaciones: number;
  serviciosPendientes: number;
  serviciosEnProceso: number;
  serviciosCompletos: number;
}

export interface ProcesoReoperacionTotal {
  proceso: string;
  total: number;
}

export interface ServiceMetricRow extends Omit<ServiceMetrics, 'boxes'> {
  boxes: BoxMetrics[];
  servicio: string;
  tipoServicio: ServiceType;
  series: number;
  placas: number;
  cajas: number;
  cajasConReoperaciones: number;
  cajasPendientes: number;
  cajasCompletas: number;
  cajasEnProceso: number;
  cajasCompletadasRo: number;
  placasAfectadas: number;
  placasPendientes: number;
  reoperaciones: number;
  pendientes: number;
  recuperaciones: number;
  porcentajeRecuperacion: number;
  procesos: ProcesoReoperacionTotal[];
  estado: MetricStatus;
}

export interface BoxMetricRow extends Omit<BoxMetrics, 'placas'> {
  placas: never[];
  key: string;
  servicio: string;
  caja: string;
  placasCount: number;
  serieInicial: string | null;
  serieFinal: string | null;
  cantidadSeries: number;
  placasAfectadas: number;
  placasConPendientes: number;
  reoperaciones: number;
  pendientes: number;
  recuperaciones: number;
  estado: MetricStatus;
  completadaManual: boolean;
  completadaAt: string | null;
}

export interface ReoperationWithPlaca {
  id: string;
  produccion_id: string;
  placa_id: string | null;
  proceso: string;
  fecha_hora: string;
  operador: string;
  usuario: string;
  estado: 'pendiente' | 'completo';
  observaciones: string;
  serie: string;
  posicion: string;
  servicio: string;
  numero_caja: string;
}

export interface ReportData {
  servicioGeneral: Array<{
    servicio: string;
    tipoServicio: ServiceType;
    series: number;
    cajas: number;
    placas: number;
    reoperaciones: number;
    recuperadas: number;
    pendientes: number;
    recuperaciones: number;
    porcentajeTotal: number;
  }>;
  reopsByServicioProceso: Array<{
    servicio: string;
    proceso: string;
    total: number;
    pendientes: number;
  }>;
  recupsByServicio: Array<{
    servicio: string;
    total: number;
    manuales: number;
    normales: number;
  }>;
  estadoCajas: Array<{
    servicio: string;
    caja: string;
    estado: MetricStatus;
    reoperaciones: number;
    pendientes: number;
    completadaManual: boolean;
  }>;
  topPlacas: Array<{
    serie: string;
    posicion: string;
    servicio: string;
    caja: string;
    reoperaciones: number;
    pendientes: number;
  }>;
  evolucion: Array<{
    fecha: string;
    reoperaciones: number;
    recuperaciones: number;
  }>;
  recupsPorOperador: Array<{
    operador: string;
    total: number;
    manuales: number;
  }>;
  incidenciasPorMotivo: Array<{
    motivo: string;
    total: number;
  }>;
}

const VALID_STATUSES: MetricStatus[] = ['en_proceso', 'con_reoperaciones', 'completada', 'completada_ro'];

function toMetricStatus(value: string): MetricStatus {
  return (VALID_STATUSES as string[]).includes(value) ? (value as MetricStatus) : 'en_proceso';
}

export async function fetchProductionMetrics(produccionId: string): Promise<ProductionMetrics> {
  const { data, error } = await supabase.rpc('get_production_metrics', { p_produccion_id: produccionId });
  if (error || !data) throw new Error('No se pudieron cargar las métricas de la producción.');
  const d = data as Record<string, number>;
  return {
    totalPlacas: Number(d.totalPlacas ?? 0),
    placasAfectadas: Number(d.placasAfectadas ?? 0),
    placasConPendientes: Number(d.placasConPendientes ?? 0),
    porcentajePlacasAfectadas: percent(Number(d.placasAfectadas ?? 0), Number(d.totalPlacas ?? 0)),
    totalReoperaciones: Number(d.totalReoperaciones ?? 0),
    reoperacionesPendientes: Number(d.reoperacionesPendientes ?? 0),
    totalRecuperaciones: Number(d.totalRecuperaciones ?? 0),
    porcentajeRecuperacion: percent(Number(d.totalReoperaciones ?? 0) - Number(d.reoperacionesPendientes ?? 0), Number(d.totalReoperaciones ?? 0)),
    cajasConReoperaciones: Number(d.cajasConReoperaciones ?? 0),
    cajasPendientes: Number(d.cajasPendientes ?? 0),
    cajasCompletas: Number(d.cajasCompletas ?? 0),
    cajasEnProceso: Number(d.cajasEnProceso ?? 0),
    cajasCompletadasRo: Number(d.cajasCompletadasRo ?? 0),
    serviciosConReoperaciones: Number(d.serviciosConReoperaciones ?? 0),
    serviciosPendientes: Number(d.serviciosPendientes ?? 0),
    serviciosEnProceso: Number(d.serviciosEnProceso ?? 0),
    serviciosCompletos: Number(d.serviciosCompletos ?? 0),
  };
}

async function fetchServiceReoperationBreakdown(
  produccionId: string,
): Promise<Map<string, { placasPendientes: number; procesos: ProcesoReoperacionTotal[] }>> {
  const { data, error } = await supabase.rpc('get_service_reoperation_breakdown', { p_produccion_id: produccionId });
  if (error || !Array.isArray(data)) throw new Error('No se pudo cargar el desglose de reoperaciones.');
  return new Map(
    data.map((row: Record<string, unknown>) => [
      String(row.servicio),
      {
        placasPendientes: Number(row.placas_pendientes),
        procesos: Array.isArray(row.procesos)
          ? (row.procesos as Record<string, unknown>[]).map((p) => ({ proceso: String(p.proceso), total: Number(p.total) }))
          : [],
      },
    ]),
  );
}

export async function fetchServiceMetrics(produccionId: string): Promise<ServiceMetricRow[]> {
  const [{ data, error }, breakdown] = await Promise.all([
    supabase.rpc('get_service_metrics', { p_produccion_id: produccionId }),
    fetchServiceReoperationBreakdown(produccionId),
  ]);
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar las métricas de servicios.');
  return data.map((row: Record<string, unknown>) => ({
    servicio: String(row.servicio),
    placasPendientes: breakdown.get(String(row.servicio))?.placasPendientes ?? 0,
    procesos: breakdown.get(String(row.servicio))?.procesos ?? [],
    tipoServicio: (row.tipo_servicio === 'JGS' ? 'JGS' : 'PZ') as ServiceType,
    series: Number(row.series),
    placas: Number(row.placas),
    cajas: Number(row.cajas),
    cajasConReoperaciones: Number(row.cajas_con_reoperaciones),
    cajasPendientes: Number(row.cajas_pendientes),
    cajasCompletas: Number(row.cajas_completas),
    cajasEnProceso: Number(row.cajas_en_proceso),
    cajasCompletadasRo: Number(row.cajas_completadas_ro),
    placasAfectadas: Number(row.placas_afectadas),
    reoperaciones: Number(row.reoperaciones),
    pendientes: Number(row.pendientes),
    recuperaciones: Number(row.recuperaciones),
    porcentajeRecuperacion: percent(Number(row.reoperaciones) - Number(row.pendientes), Number(row.reoperaciones)),
    estado: toMetricStatus(String(row.estado)),
    boxes: [],
  }));
}

export async function fetchBoxMetrics(produccionId: string): Promise<BoxMetricRow[]> {
  const { data, error } = await supabase.rpc('get_box_metrics', { p_produccion_id: produccionId });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar las métricas de cajas.');
  return data.map((row: Record<string, unknown>) => ({
    key: String(row.key),
    servicio: String(row.servicio),
    caja: String(row.numero_caja),
    placasCount: Number(row.placas),
    serieInicial: row.serie_inicial ? String(row.serie_inicial) : null,
    serieFinal: row.serie_final ? String(row.serie_final) : null,
    cantidadSeries: Number(row.cantidad_series ?? 0),
    placasAfectadas: Number(row.placas_afectadas),
    placasConPendientes: Number(row.placas_con_pendientes),
    reoperaciones: Number(row.reoperaciones),
    pendientes: Number(row.pendientes),
    recuperaciones: Number(row.recuperaciones),
    estado: toMetricStatus(String(row.estado)),
    completadaManual: Boolean(row.completada_manual),
    completadaAt: row.completada_at ? String(row.completada_at) : null,
    placas: [],
  }));
}

export async function fetchBoxPlacaMovements(
  produccionId: string,
  servicio: string,
  numeroCaja: string,
): Promise<PlacaMovementRow[]> {
  const { data, error } = await supabase.rpc('get_box_placa_movements', {
    p_produccion_id: produccionId,
    p_servicio: servicio,
    p_numero_caja: numeroCaja,
  });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar los movimientos de la caja.');
  return data.map((row: Record<string, unknown>) => ({
    placaId: String(row.placa_id),
    serie: String(row.serie),
    posicion: String(row.posicion),
    servicio,
    caja: numeroCaja,
    proceso: String(row.proceso ?? ''),
    fecha: String(row.fecha ?? ''),
    operador: String(row.operador ?? ''),
    movimientos: Number(row.movimientos),
    pendientes: Number(row.pendientes),
    estado: (row.estado === 'pendiente' ? 'pendiente' : 'completo') as 'pendiente' | 'completo',
  }));
}

export async function fetchReoperacionesWithPlaca(produccionId: string): Promise<ReoperationWithPlaca[]> {
  const { data, error } = await supabase.rpc('list_reoperaciones_with_placa', { p_produccion_id: produccionId });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar las reoperaciones.');
  return data as ReoperationWithPlaca[];
}

export async function fetchReportData(produccionId: string): Promise<ReportData> {
  const { data, error } = await supabase.rpc('get_report_data', { p_produccion_id: produccionId });
  if (error || !data) throw new Error('No se pudieron cargar los datos de reportes.');
  return data as ReportData;
}

export interface BoxPageResult {
  boxes: BoxMetricRow[];
  totalCount: number;
}

export async function fetchServiceBoxPage(
  produccionId: string,
  servicio: string | null,
  estado: 'todos' | MetricStatus,
  page: number,
  pageSize: number = 50,
  search?: string,
): Promise<BoxPageResult> {
  const { data, error } = await supabase.rpc('get_service_box_page', {
    p_produccion_id: produccionId,
    p_servicio: servicio,
    p_estado: estado,
    p_page: page,
    p_page_size: pageSize,
    p_search: search ?? null,
  });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar las cajas.');
  if (data.length === 0) return { boxes: [], totalCount: 0 };
  const totalCount = Number((data[0] as Record<string, unknown>).total_count ?? 0);
  const boxes: BoxMetricRow[] = data.map((row: Record<string, unknown>) => ({
    key: String(row.key),
    servicio: String(row.servicio),
    caja: String(row.numero_caja),
    placasCount: Number(row.placas),
    serieInicial: row.serie_inicial ? String(row.serie_inicial) : null,
    serieFinal: row.serie_final ? String(row.serie_final) : null,
    cantidadSeries: Number(row.cantidad_series ?? 0),
    placasAfectadas: Number(row.placas_afectadas),
    placasConPendientes: Number(row.placas_con_pendientes),
    reoperaciones: Number(row.reoperaciones),
    pendientes: Number(row.pendientes),
    recuperaciones: Number(row.recuperaciones),
    estado: toMetricStatus(String(row.estado)),
    completadaManual: Boolean(row.completada_manual),
    completadaAt: row.completada_at ? String(row.completada_at) : null,
    placas: [],
  }));
  return { boxes, totalCount };
}

export async function markBoxCompleted(
  produccionId: string,
  servicio: string,
  numeroCaja: string,
): Promise<{ estado: MetricStatus; completadaManual: boolean; completadaAt: string | null }> {
  const { data, error } = await supabase.rpc('mark_box_completed', {
    p_produccion_id: produccionId,
    p_servicio: servicio,
    p_numero_caja: numeroCaja,
  });
  if (error) throw new Error(error.message || 'No se pudo marcar la caja como completada.');
  const row = (data as Record<string, unknown>[])?.[0] ?? {};
  return {
    estado: toMetricStatus(String(row.estado ?? 'completada')),
    completadaManual: Boolean(row.completada_manual),
    completadaAt: row.completada_at ? String(row.completada_at) : null,
  };
}

export async function reopenBox(
  produccionId: string,
  servicio: string,
  numeroCaja: string,
): Promise<{ estado: MetricStatus; completadaManual: boolean; completadaAt: string | null }> {
  const { data, error } = await supabase.rpc('reopen_box', {
    p_produccion_id: produccionId,
    p_servicio: servicio,
    p_numero_caja: numeroCaja,
  });
  if (error) throw new Error(error.message || 'No se pudo reabrir la caja.');
  const row = (data as Record<string, unknown>[])?.[0] ?? {};
  return {
    estado: toMetricStatus(String(row.estado ?? 'en_proceso')),
    completadaManual: Boolean(row.completada_manual),
    completadaAt: row.completada_at ? String(row.completada_at) : null,
  };
}
