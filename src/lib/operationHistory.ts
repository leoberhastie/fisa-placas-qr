import type { HistorialOperacion, Placa, Recuperacion, Reoperation } from '@/types/domain';

export type HistoryTipo = 'reoperacion' | 'recuperacion' | 'importacion' | 'cambio_estado';
export type HistoryModalidad = 'normal' | 'manual' | 'none';

export interface HistoryRow {
  id: string;
  tipo: HistoryTipo;
  modalidad: HistoryModalidad;
  fechaIso: string;
  placaId: string | null;
  serie: string;
  posicion: string;
  servicio: string;
  caja: string;
  proceso: string;
  operador: string;
  detalle: string;
}

export const TIPO_LABELS: Record<HistoryTipo, string> = {
  reoperacion: 'Reoperación',
  recuperacion: 'Recuperación',
  importacion: 'Importación',
  cambio_estado: 'Cambio de estado',
};

export const MODALIDAD_LABELS: Record<HistoryModalidad, string> = {
  normal: 'Normal',
  manual: 'Manual',
  none: '—',
};

export function buildHistoryRows(
  placas: Placa[],
  reoperaciones: Reoperation[],
  recuperaciones: Recuperacion[],
  historial: HistorialOperacion[],
): HistoryRow[] {
  const placaMap = new Map(placas.map((p) => [p.id, p]));
  const placaFields = (placaId: string | null) => {
    const placa = placaId ? placaMap.get(placaId) : undefined;
    return {
      serie: placa?.serie ?? '',
      posicion: placa?.posicion ?? '',
      servicio: placa?.servicio ?? '',
      caja: placa?.numero_caja ?? '',
    };
  };

  const reopRows: HistoryRow[] = reoperaciones.map((r) => ({
    id: `reop-${r.id}`,
    tipo: 'reoperacion',
    modalidad: 'none',
    fechaIso: r.fecha_hora,
    placaId: r.placa_id,
    ...placaFields(r.placa_id),
    proceso: r.proceso,
    operador: r.operador || r.usuario,
    detalle: r.estado === 'pendiente' ? 'Pendiente' : 'Recuperada',
  }));

  const recupRows: HistoryRow[] = recuperaciones.map((c) => ({
    id: `recup-${c.id}`,
    tipo: 'recuperacion',
    modalidad: c.es_manual ? 'manual' : 'normal',
    fechaIso: c.fecha_hora,
    placaId: c.placa_id,
    ...placaFields(c.placa_id),
    proceso: '',
    operador: c.operador || c.usuario,
    detalle: [c.tipo_recuperacion, c.observaciones].filter(Boolean).join(' · '),
  }));

  const importRows: HistoryRow[] = historial
    .filter((h) => h.tipo_operacion === 'importacion')
    .map((h) => ({
      id: `imp-${h.id}`,
      tipo: 'importacion',
      modalidad: 'none',
      fechaIso: h.fecha_hora,
      placaId: null,
      serie: '',
      posicion: '',
      servicio: '',
      caja: '',
      proceso: '',
      operador: h.usuario,
      detalle: h.observaciones,
    }));

  const estadoRows: HistoryRow[] = historial
    .filter((h) => h.tipo_operacion === 'cambio_estado')
    .map((h) => {
      const match = /Caja (.+?) del servicio (.+?) (?:marcada|reabierta|cerrada)/.exec(h.observaciones);
      return {
        id: `estado-${h.id}`,
        tipo: 'cambio_estado' as const,
        modalidad: 'none' as const,
        fechaIso: h.fecha_hora,
        placaId: null,
        serie: '',
        posicion: '',
        servicio: match?.[2] ?? '',
        caja: match?.[1] ?? '',
        proceso: '',
        operador: h.usuario || h.operador,
        detalle: [
          h.estado_anterior && h.estado_nuevo ? `${h.estado_anterior} → ${h.estado_nuevo}` : '',
          h.observaciones,
        ].filter(Boolean).join(' · '),
      };
    });

  return [...reopRows, ...recupRows, ...importRows, ...estadoRows].sort((a, b) => b.fechaIso.localeCompare(a.fechaIso));
}
