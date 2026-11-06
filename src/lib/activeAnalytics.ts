import { percent } from '@/lib/operationMetrics';
import type { ProductionMetrics, ReportData } from '@/services/metricsService';

export interface ProductionSnapshot {
  produccion: string;
  metrics: ProductionMetrics;
  report: ReportData;
}

export interface ComparisonRow {
  produccion: string;
  totalPlacas: number;
  placasAfectadas: number;
  totalReoperaciones: number;
  reoperacionesPendientes: number;
  totalRecuperaciones: number;
  cajasPendientes: number;
}

export type EstadoCajaGlobal = ReportData['estadoCajas'][number] & { produccion: string };

export type TopPlacaGlobal = ReportData['topPlacas'][number] & { produccion: string };

export interface ActiveAnalytics {
  productionCount: number;
  totals: ProductionMetrics;
  comparison: ComparisonRow[];
  servicioGeneral: ReportData['servicioGeneral'];
  reopsByServicioProceso: ReportData['reopsByServicioProceso'];
  recupsByServicio: ReportData['recupsByServicio'];
  estadoCajas: EstadoCajaGlobal[];
  topPlacas: TopPlacaGlobal[];
  evolucion: ReportData['evolucion'];
  recupsPorOperador: ReportData['recupsPorOperador'];
  incidenciasPorMotivo: ReportData['incidenciasPorMotivo'];
}

const TOP_PLACAS_LIMIT = 10;

function sumOf<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function sumMetrics(items: ProductionMetrics[]): ProductionMetrics {
  const totalPlacas = sumOf(items, (m) => m.totalPlacas);
  const placasAfectadas = sumOf(items, (m) => m.placasAfectadas);
  const totalReoperaciones = sumOf(items, (m) => m.totalReoperaciones);
  const reoperacionesPendientes = sumOf(items, (m) => m.reoperacionesPendientes);
  const totalRecuperaciones = sumOf(items, (m) => m.totalRecuperaciones);
  return {
    totalPlacas,
    placasAfectadas,
    placasConPendientes: sumOf(items, (m) => m.placasConPendientes),
    porcentajePlacasAfectadas: percent(placasAfectadas, totalPlacas),
    totalReoperaciones,
    reoperacionesPendientes,
    totalRecuperaciones,
    porcentajeRecuperacion: percent(totalReoperaciones - reoperacionesPendientes, totalReoperaciones),
    cajasConReoperaciones: sumOf(items, (m) => m.cajasConReoperaciones),
    cajasPendientes: sumOf(items, (m) => m.cajasPendientes),
    cajasCompletas: sumOf(items, (m) => m.cajasCompletas),
    cajasEnProceso: sumOf(items, (m) => m.cajasEnProceso),
    cajasCompletadasRo: sumOf(items, (m) => m.cajasCompletadasRo),
    serviciosConReoperaciones: sumOf(items, (m) => m.serviciosConReoperaciones),
    serviciosPendientes: sumOf(items, (m) => m.serviciosPendientes),
    serviciosEnProceso: sumOf(items, (m) => m.serviciosEnProceso),
    serviciosCompletos: sumOf(items, (m) => m.serviciosCompletos),
  };
}

function mergeBy<T extends object>(rows: T[], keyOf: (row: T) => string, numericKeys: (keyof T)[]): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row });
      continue;
    }
    for (const field of numericKeys) {
      current[field] = ((current[field] as number) + (row[field] as number)) as T[keyof T];
    }
  }
  return [...merged.values()];
}

function mergeServicios(snapshots: ProductionSnapshot[]): ReportData['servicioGeneral'] {
  const merged = mergeBy(
    snapshots.flatMap((s) => s.report.servicioGeneral),
    (row) => row.servicio,
    ['series', 'cajas', 'placas', 'reoperaciones', 'recuperadas', 'pendientes', 'recuperaciones'],
  );
  const totalReoperaciones = sumOf(merged, (row) => row.reoperaciones);
  return merged
    .map((row) => ({ ...row, porcentajeTotal: percent(row.reoperaciones, totalReoperaciones) }))
    .sort((a, b) => a.servicio.localeCompare(b.servicio));
}

export function aggregateActiveProductions(snapshots: ProductionSnapshot[]): ActiveAnalytics {
  const reports = snapshots.map((s) => s.report);
  return {
    productionCount: snapshots.length,
    totals: sumMetrics(snapshots.map((s) => s.metrics)),
    comparison: snapshots.map((s) => ({
      produccion: s.produccion,
      totalPlacas: s.metrics.totalPlacas,
      placasAfectadas: s.metrics.placasAfectadas,
      totalReoperaciones: s.metrics.totalReoperaciones,
      reoperacionesPendientes: s.metrics.reoperacionesPendientes,
      totalRecuperaciones: s.metrics.totalRecuperaciones,
      cajasPendientes: s.metrics.cajasPendientes,
    })),
    servicioGeneral: mergeServicios(snapshots),
    reopsByServicioProceso: mergeBy(
      reports.flatMap((r) => r.reopsByServicioProceso),
      (row) => `${row.servicio}|${row.proceso}`,
      ['total', 'pendientes'],
    ),
    recupsByServicio: mergeBy(
      reports.flatMap((r) => r.recupsByServicio),
      (row) => row.servicio,
      ['total', 'manuales', 'normales'],
    ).sort((a, b) => b.total - a.total),
    estadoCajas: snapshots.flatMap((s) => s.report.estadoCajas.map((caja) => ({ ...caja, produccion: s.produccion }))),
    topPlacas: snapshots
      .flatMap((s) => s.report.topPlacas.map((placa) => ({ ...placa, produccion: s.produccion })))
      .sort((a, b) => b.reoperaciones - a.reoperaciones)
      .slice(0, TOP_PLACAS_LIMIT),
    evolucion: mergeBy(
      reports.flatMap((r) => r.evolucion),
      (row) => row.fecha,
      ['reoperaciones', 'recuperaciones'],
    ).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    recupsPorOperador: mergeBy(
      reports.flatMap((r) => r.recupsPorOperador),
      (row) => row.operador,
      ['total', 'manuales'],
    ).sort((a, b) => b.total - a.total),
    incidenciasPorMotivo: mergeBy(
      reports.flatMap((r) => r.incidenciasPorMotivo),
      (row) => row.motivo,
      ['total'],
    ).sort((a, b) => b.total - a.total),
  };
}
