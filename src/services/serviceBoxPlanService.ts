import { supabase } from '@/lib/supabase';
import type { ServiceType } from '@/types/domain';

export interface ServiceBoxBounds {
  placasTotal: number;
  consecutivosDistintos: number;
  consecutivoMinimo: number | null;
  consecutivoMaximo: number | null;
  serieInicial: string | null;
  serieFinal: string | null;
  cajasExistentes: number;
}

export interface ServiceBoxPlanRow {
  orden: number;
  numeroCaja: string;
  consecutivoInicial: number;
  consecutivoFinal: number;
  serieInicial: string;
  serieFinal: string;
  cantidadSeries: number;
  cantidadPlacas: number;
}

export interface ServiceBoxPlanSaved {
  cajas: number;
  series: number;
  placas: number;
}

type RpcRow = Record<string, unknown>;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('La respuesta del servidor no tiene el formato esperado.');
  return parsed;
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}

function toText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('La respuesta del servidor no tiene el formato esperado.');
  return value;
}

function toNullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : toText(value);
}

function firstRow(data: unknown): RpcRow {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('El servidor no devolvió resultados.');
  }
  return data[0] as RpcRow;
}

export async function getServiceBoxBounds(produccionId: string, servicio: string): Promise<ServiceBoxBounds> {
  const { data, error } = await supabase.rpc('get_service_box_bounds', {
    p_produccion_id: produccionId,
    p_servicio: servicio,
  });
  if (error) throw new Error(error.message || 'No se pudo consultar el rango de placas del servicio.');

  const row = firstRow(data);
  return {
    placasTotal: toNumber(row.placas_total),
    consecutivosDistintos: toNumber(row.consecutivos_distintos),
    consecutivoMinimo: toNullableNumber(row.consecutivo_minimo),
    consecutivoMaximo: toNullableNumber(row.consecutivo_maximo),
    serieInicial: toNullableText(row.serie_inicial),
    serieFinal: toNullableText(row.serie_final),
    cajasExistentes: toNumber(row.cajas_existentes),
  };
}

export interface ServiceBoxPlanInput {
  produccionId: string;
  servicio: string;
  tipo: ServiceType;
  serieInicial: string;
  serieFinal: string;
  piezasPorCaja: number;
}

function planParams(input: ServiceBoxPlanInput) {
  return {
    p_produccion_id: input.produccionId,
    p_servicio: input.servicio,
    p_tipo_servicio: input.tipo,
    p_serie_inicial: input.serieInicial,
    p_serie_final: input.serieFinal,
    p_piezas_por_caja: input.piezasPorCaja,
  };
}

export async function previewServiceBoxPlan(input: ServiceBoxPlanInput): Promise<ServiceBoxPlanRow[]> {
  const { data, error } = await supabase.rpc('build_service_box_plan', planParams(input));
  if (error) throw new Error(error.message || 'No se pudo calcular la distribución de cajas.');
  if (!Array.isArray(data)) throw new Error('El servidor no devolvió la distribución de cajas.');

  return (data as RpcRow[]).map((row) => ({
    orden: toNumber(row.orden),
    numeroCaja: toText(row.numero_caja),
    consecutivoInicial: toNumber(row.consecutivo_inicial),
    consecutivoFinal: toNumber(row.consecutivo_final),
    serieInicial: toText(row.serie_inicial),
    serieFinal: toText(row.serie_final),
    cantidadSeries: toNumber(row.cantidad_series),
    cantidadPlacas: toNumber(row.cantidad_placas),
  }));
}

export async function replaceServiceBoxPlan(input: ServiceBoxPlanInput): Promise<ServiceBoxPlanSaved> {
  const { data, error } = await supabase.rpc('replace_service_boxes_plan', planParams(input));
  if (error) throw new Error(error.message || 'No se pudo guardar la asignación de cajas.');

  const row = firstRow(data);
  return {
    cajas: toNumber(row.cajas_creadas),
    series: toNumber(row.series_asignadas),
    placas: toNumber(row.placas_asignadas),
  };
}
