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
  porcentajeReoperaciones: number;
}

export interface ProcesoDistribucionRow {
  proceso: string;
  total: number;
  porcentaje: number;
}

export type EstadoCajaGlobal = ReportData['estadoCajas'][number] & { produccion: string };

export interface ActiveAnalytics {
  productionCount: number;
  totals: ProductionMetrics;
  comparison: ComparisonRow[];
  distribucionProcesos: ProcesoDistribucionRow[];
  servicioGeneral: ReportData['servicioGeneral'];
  reopsByServicioProceso: ReportData['reopsByServicioProceso'];
  recupsByServicio: ReportData['recupsByServicio'];
  estadoCajas: EstadoCajaGlobal[];
  evolucion: ReportData['evolucion'];
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
}

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
    .sort((a, b) => compareText(a.servicio, b.servicio));
}

function buildDistribucionProcesos(
  reopsByServicioProceso: ReportData['reopsByServicioProceso'],
  placasAfectadas: number,
): ProcesoDistribucionRow[] {
  const porProceso = new Map<string, number>();
  for (const row of reopsByServicioProceso) {
    porProceso.set(row.proceso, (porProceso.get(row.proceso) ?? 0) + row.total);
  }
  return [...porProceso.entries()]
    .map(([proceso, total]) => ({ proceso, total, porcentaje: percent(total, placasAfectadas) }))
    .sort((a, b) => compareText(a.proceso, b.proceso));
}

export function aggregateActiveProductions(snapshots: ProductionSnapshot[]): ActiveAnalytics {
  const reports = snapshots.map((s) => s.report);
  const totals = sumMetrics(snapshots.map((s) => s.metrics));
  const reopsByServicioProceso = mergeBy(
    reports.flatMap((r) => r.reopsByServicioProceso),
    (row) => `${row.servicio}|${row.proceso}`,
    ['total', 'pendientes'],
  );
  return {
    productionCount: snapshots.length,
    totals,
    comparison: snapshots
      .map((s) => ({
      produccion: s.produccion,
      totalPlacas: s.metrics.totalPlacas,
      placasAfectadas: s.metrics.placasAfectadas,
      totalReoperaciones: s.metrics.totalReoperaciones,
      reoperacionesPendientes: s.metrics.reoperacionesPendientes,
      totalRecuperaciones: s.metrics.totalRecuperaciones,
      cajasPendientes: s.metrics.cajasPendientes,
      porcentajeReoperaciones: percent(s.metrics.totalReoperaciones, totals.placasAfectadas),
      }))
      .sort((a, b) => compareText(a.produccion, b.produccion)),
    distribucionProcesos: buildDistribucionProcesos(reopsByServicioProceso, totals.placasAfectadas),
    servicioGeneral: mergeServicios(snapshots),
    reopsByServicioProceso: [...reopsByServicioProceso].sort(
      (a, b) => compareText(a.servicio, b.servicio) || compareText(a.proceso, b.proceso),
    ),
    recupsByServicio: mergeBy(
      reports.flatMap((r) => r.recupsByServicio),
      (row) => row.servicio,
      ['total', 'manuales', 'normales'],
    ).sort((a, b) => compareText(a.servicio, b.servicio)),
    estadoCajas: snapshots
      .flatMap((s) => s.report.estadoCajas.map((caja) => ({ ...caja, produccion: s.produccion })))
      .sort(
        (a, b) =>
          compareText(a.produccion, b.produccion) || compareText(a.servicio, b.servicio) || compareText(a.caja, b.caja),
      ),
    evolucion: mergeBy(
      reports.flatMap((r) => r.evolucion),
      (row) => row.fecha,
      ['reoperaciones', 'recuperaciones'],
    ).sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}
