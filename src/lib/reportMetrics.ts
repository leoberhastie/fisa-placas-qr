import { computeMetrics, percent, type MetricStatus, type ProductionMetrics } from '@/lib/operationMetrics';
import { toDateKey } from '@/lib/dateKey';
import type { Placa, Recuperacion, Reoperation, ServiceType } from '@/types/domain';

export interface ReportInput {
  placas: Placa[];
  reoperaciones: Reoperation[];
  recuperaciones: Recuperacion[];
}

export interface ReopServicioProcesoRow {
  servicio: string;
  proceso: string;
  total: number;
  pendientes: number;
}

export interface RecupServicioRow {
  servicio: string;
  total: number;
  manuales: number;
  normales: number;
}

export interface ServicioGeneralRow {
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
}

export interface TopPlacaRow {
  serie: string;
  posicion: string;
  servicio: string;
  caja: string;
  reoperaciones: number;
  pendientes: number;
}

export interface EvolucionRow {
  fecha: string;
  reoperaciones: number;
  recuperaciones: number;
}

export interface RecupOperadorRow {
  operador: string;
  total: number;
  manuales: number;
}

export interface MotivoRow {
  motivo: string;
  total: number;
}

export interface EstadoRow {
  servicio: string;
  caja: string;
  estado: MetricStatus;
  reoperaciones: number;
  pendientes: number;
  completadaManual?: boolean;
}

export function buildPlacaMap(placas: Placa[]): Map<string, Placa> {
  return new Map(placas.map((p) => [p.id, p]));
}

export function servicioGeneral(input: ReportInput): ServicioGeneralRow[] {
  const metrics = computeMetrics(input);
  const totalReoperaciones = metrics.totalReoperaciones;
  return metrics.services.map((service) => ({
    servicio: service.servicio,
    tipoServicio: service.tipoServicio,
    series: service.series,
    cajas: service.cajas,
    placas: service.placas,
    reoperaciones: service.reoperaciones,
    recuperadas: service.reoperaciones - service.pendientes,
    pendientes: service.pendientes,
    recuperaciones: service.recuperaciones,
    porcentajeTotal: percent(service.reoperaciones, totalReoperaciones),
  }));
}

export function reopsByServicioProceso({ placas, reoperaciones }: ReportInput): ReopServicioProcesoRow[] {
  const placaMap = buildPlacaMap(placas);
  const acc = new Map<string, ReopServicioProcesoRow>();
  reoperaciones.forEach((r) => {
    const servicio = (r.placa_id && placaMap.get(r.placa_id)?.servicio) || 'Sin servicio';
    const key = `${servicio}||${r.proceso}`;
    const row = acc.get(key) ?? { servicio, proceso: r.proceso, total: 0, pendientes: 0 };
    row.total += 1;
    if (r.estado === 'pendiente') row.pendientes += 1;
    acc.set(key, row);
  });
  return [...acc.values()].sort((a, b) => a.servicio.localeCompare(b.servicio, 'es') || b.total - a.total);
}

export function recupsByServicio({ placas, recuperaciones }: ReportInput): RecupServicioRow[] {
  const placaMap = buildPlacaMap(placas);
  const acc = new Map<string, RecupServicioRow>();
  recuperaciones.forEach((c) => {
    const servicio = (c.placa_id && placaMap.get(c.placa_id)?.servicio) || 'Sin servicio';
    const row = acc.get(servicio) ?? { servicio, total: 0, manuales: 0, normales: 0 };
    row.total += 1;
    if (c.es_manual) row.manuales += 1;
    else row.normales += 1;
    acc.set(servicio, row);
  });
  return [...acc.values()].sort((a, b) => b.total - a.total);
}

export function topPlacas({ placas, reoperaciones }: ReportInput, limit = 10): TopPlacaRow[] {
  const placaMap = buildPlacaMap(placas);
  const acc = new Map<string, TopPlacaRow>();
  reoperaciones.forEach((r) => {
    if (!r.placa_id) return;
    const placa = placaMap.get(r.placa_id);
    if (!placa) return;
    const row = acc.get(placa.id) ?? {
      serie: placa.serie,
      posicion: placa.posicion,
      servicio: placa.servicio,
      caja: placa.numero_caja,
      reoperaciones: 0,
      pendientes: 0,
    };
    row.reoperaciones += 1;
    if (r.estado === 'pendiente') row.pendientes += 1;
    acc.set(placa.id, row);
  });
  return [...acc.values()].sort((a, b) => b.reoperaciones - a.reoperaciones || a.serie.localeCompare(b.serie)).slice(0, limit);
}

export function evolucionPorFecha({ reoperaciones, recuperaciones }: ReportInput): EvolucionRow[] {
  const acc = new Map<string, EvolucionRow>();
  const get = (fecha: string) => {
    const row = acc.get(fecha) ?? { fecha, reoperaciones: 0, recuperaciones: 0 };
    acc.set(fecha, row);
    return row;
  };
  reoperaciones.forEach((r) => {
    get(toDateKey(r.fecha_hora)).reoperaciones += 1;
  });
  recuperaciones.forEach((c) => {
    get(toDateKey(c.fecha_hora)).recuperaciones += 1;
  });
  return [...acc.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function recupsPorOperador({ recuperaciones }: ReportInput): RecupOperadorRow[] {
  const acc = new Map<string, RecupOperadorRow>();
  recuperaciones.forEach((c) => {
    const operador = c.operador || c.usuario || 'Sin operador';
    const row = acc.get(operador) ?? { operador, total: 0, manuales: 0 };
    row.total += 1;
    if (c.es_manual) row.manuales += 1;
    acc.set(operador, row);
  });
  return [...acc.values()].sort((a, b) => b.total - a.total);
}

export function incidenciasPorMotivo({ recuperaciones }: ReportInput): MotivoRow[] {
  const acc = new Map<string, number>();
  recuperaciones.forEach((c) => {
    const motivo = c.tipo_recuperacion || 'Sin motivo';
    acc.set(motivo, (acc.get(motivo) ?? 0) + 1);
  });
  return [...acc.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total);
}

export function estadoCajas(input: ReportInput): EstadoRow[] {
  const metrics: ProductionMetrics = computeMetrics(input);
  return metrics.services.flatMap((service) =>
    service.boxes.map((box) => ({
      servicio: service.servicio,
      caja: box.caja,
      estado: box.estado,
      reoperaciones: box.reoperaciones,
      pendientes: box.pendientes,
      completadaManual: box.completadaManual,
    })),
  );
}
