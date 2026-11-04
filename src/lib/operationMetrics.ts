import type { Placa, Recuperacion, Reoperation, ServiceType } from '@/types/domain';
import type { MetricStatus } from '@/lib/metricsTypes';

export type { MetricStatus };

export interface BoxMetrics {
  key: string;
  caja: string;
  servicio: string;
  placas: Placa[];
  placasCount?: number;
  placasAfectadas: number;
  placasConPendientes: number;
  reoperaciones: number;
  pendientes: number;
  recuperaciones: number;
  estado: MetricStatus;
  completadaManual?: boolean;
  completadaAt?: string | null;
  serieInicial?: string | null;
  serieFinal?: string | null;
  cantidadSeries?: number;
}

export interface ServiceMetrics {
  servicio: string;
  tipoServicio: ServiceType;
  series: number;
  placas: number;
  cajas: number;
  cajasConReoperaciones: number;
  cajasPendientes: number;
  cajasCompletas: number;
  cajasEnProceso?: number;
  cajasCompletadasRo?: number;
  placasAfectadas: number;
  reoperaciones: number;
  pendientes: number;
  recuperaciones: number;
  porcentajeRecuperacion: number;
  estado: MetricStatus;
  boxes: BoxMetrics[];
}

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
  cajasEnProceso?: number;
  cajasCompletadasRo?: number;
  serviciosConReoperaciones: number;
  serviciosPendientes: number;
  serviciosEnProceso?: number;
  serviciosCompletos: number;
  services: ServiceMetrics[];
}

export interface MetricsInput {
  placas: Placa[];
  reoperaciones: Reoperation[];
  recuperaciones: Recuperacion[];
}

export function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function boxStatusFromCounts(reops: number, pend: number, manual: boolean): MetricStatus {
  if (pend > 0) return 'con_reoperaciones';
  if (reops > 0) return 'completada_ro';
  if (manual) return 'completada';
  return 'en_proceso';
}

export function computeMetrics({ placas, reoperaciones, recuperaciones }: MetricsInput): ProductionMetrics {
  const placaById = new Map(placas.map((p) => [p.id, p]));
  const reopsByPlaca = groupBy(
    reoperaciones.filter((r) => r.placa_id && placaById.has(r.placa_id)),
    (r) => r.placa_id as string,
  );
  const recupsByPlaca = groupBy(
    recuperaciones.filter((r) => r.placa_id && placaById.has(r.placa_id)),
    (r) => r.placa_id as string,
  );

  const boxGroups = groupBy(placas, (p) => `${p.servicio}|${p.numero_caja}`);
  const boxes: BoxMetrics[] = Array.from(boxGroups.entries()).map(([key, boxPlacas]) => {
    let reops = 0;
    let pend = 0;
    let recs = 0;
    let afectadas = 0;
    let conPendientes = 0;
    for (const placa of boxPlacas) {
      const pr = reopsByPlaca.get(placa.id) ?? [];
      const pp = pr.filter((r) => r.estado === 'pendiente').length;
      reops += pr.length;
      pend += pp;
      recs += (recupsByPlaca.get(placa.id) ?? []).length;
      if (pr.length > 0) afectadas += 1;
      if (pp > 0) conPendientes += 1;
    }
    return {
      key,
      caja: boxPlacas[0].numero_caja,
      servicio: boxPlacas[0].servicio,
      placas: boxPlacas,
      placasAfectadas: afectadas,
      placasConPendientes: conPendientes,
      reoperaciones: reops,
      pendientes: pend,
      recuperaciones: recs,
      estado: boxStatusFromCounts(reops, pend, false),
    };
  });

  const boxesByService = groupBy(boxes, (b) => b.servicio);
  const services: ServiceMetrics[] = Array.from(boxesByService.entries())
    .map(([servicio, serviceBoxes]) => {
      const reops = serviceBoxes.reduce((s, b) => s + b.reoperaciones, 0);
      const pend = serviceBoxes.reduce((s, b) => s + b.pendientes, 0);
      const recs = serviceBoxes.reduce((s, b) => s + b.recuperaciones, 0);
      const conReops = serviceBoxes.filter((b) => b.reoperaciones > 0);
      const placas = serviceBoxes.reduce((s, b) => s + b.placas.length, 0);
      const series = new Set(serviceBoxes.flatMap((b) => b.placas.map((p) => p.consecutivo))).size;
      const hasConReops = serviceBoxes.some((b) => b.estado === 'con_reoperaciones');
      const hasEnProceso = serviceBoxes.some((b) => b.estado === 'en_proceso');
      const serviceEstado: MetricStatus = hasConReops
        ? 'con_reoperaciones'
        : hasEnProceso
          ? 'en_proceso'
          : 'completada';
      return {
        servicio,
        tipoServicio: (placas > series ? 'JGS' : 'PZ') as ServiceType,
        series,
        placas,
        cajas: serviceBoxes.length,
        cajasConReoperaciones: conReops.length,
        cajasPendientes: serviceBoxes.filter((b) => b.estado === 'con_reoperaciones').length,
        cajasCompletas: serviceBoxes.filter((b) => b.estado === 'completada' || b.estado === 'completada_ro').length,
        cajasEnProceso: serviceBoxes.filter((b) => b.estado === 'en_proceso').length,
        cajasCompletadasRo: serviceBoxes.filter((b) => b.estado === 'completada_ro').length,
        placasAfectadas: serviceBoxes.reduce((s, b) => s + b.placasAfectadas, 0),
        reoperaciones: reops,
        pendientes: pend,
        recuperaciones: recs,
        porcentajeRecuperacion: percent(reops - pend, reops),
        estado: serviceEstado,
        boxes: serviceBoxes.sort((a, b) => a.caja.localeCompare(b.caja, 'es', { numeric: true })),
      };
    })
    .sort((a, b) => a.servicio.localeCompare(b.servicio, 'es'));

  const totalReops = reoperaciones.filter((r) => r.placa_id && placaById.has(r.placa_id)).length;
  const pendientesTotal = reoperaciones.filter(
    (r) => r.estado === 'pendiente' && r.placa_id && placaById.has(r.placa_id),
  ).length;
  const placasAfectadas = Array.from(reopsByPlaca.keys()).length;
  const placasConPendientes = new Set(
    reoperaciones
      .filter((r) => r.estado === 'pendiente' && r.placa_id && placaById.has(r.placa_id))
      .map((r) => r.placa_id as string),
  ).size;
  const recuperacionesTotal = recuperaciones.filter((r) => r.placa_id && placaById.has(r.placa_id)).length;
  const cajasConReops = boxes.filter((b) => b.reoperaciones > 0);

  return {
    totalPlacas: placas.length,
    placasAfectadas,
    placasConPendientes,
    porcentajePlacasAfectadas: percent(placasAfectadas, placas.length),
    totalReoperaciones: totalReops,
    reoperacionesPendientes: pendientesTotal,
    totalRecuperaciones: recuperacionesTotal,
    porcentajeRecuperacion: percent(totalReops - pendientesTotal, totalReops),
    cajasConReoperaciones: cajasConReops.length,
    cajasPendientes: boxes.filter((b) => b.estado === 'con_reoperaciones').length,
    cajasCompletas: boxes.filter((b) => b.estado === 'completada' || b.estado === 'completada_ro').length,
    cajasEnProceso: boxes.filter((b) => b.estado === 'en_proceso').length,
    cajasCompletadasRo: boxes.filter((b) => b.estado === 'completada_ro').length,
    serviciosConReoperaciones: services.filter((s) => s.estado === 'con_reoperaciones').length,
    serviciosPendientes: services.filter((s) => s.estado === 'con_reoperaciones').length,
    serviciosEnProceso: services.filter((s) => s.estado === 'en_proceso').length,
    serviciosCompletos: services.filter((s) => s.estado === 'completada').length,
    services,
  };
}
