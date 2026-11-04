import type { Placa, Reoperation } from '@/types/domain';

export interface PlacaMovementRow {
  placaId: string;
  serie: string;
  posicion: string;
  servicio: string;
  caja: string;
  proceso: string;
  fecha: string;
  operador: string;
  movimientos: number;
  pendientes: number;
  estado: 'pendiente' | 'completo';
}

export function buildPlacaMovementRows(placas: Placa[], reoperaciones: Reoperation[]): PlacaMovementRow[] {
  const placaIds = new Set(placas.map((p) => p.id));
  const reopsByPlaca = new Map<string, Reoperation[]>();
  for (const r of reoperaciones) {
    if (!r.placa_id || !placaIds.has(r.placa_id)) continue;
    const arr = reopsByPlaca.get(r.placa_id) ?? [];
    arr.push(r);
    reopsByPlaca.set(r.placa_id, arr);
  }

  const rows: PlacaMovementRow[] = [];
  for (const placa of placas) {
    const movimientos = reopsByPlaca.get(placa.id);
    if (!movimientos || movimientos.length === 0) continue;
    const pendientes = movimientos.filter((r) => r.estado === 'pendiente');
    const pool = pendientes.length > 0 ? pendientes : movimientos;
    const latest = [...pool].sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))[0];
    rows.push({
      placaId: placa.id,
      serie: placa.serie,
      posicion: placa.posicion,
      servicio: placa.servicio,
      caja: placa.numero_caja,
      proceso: latest.proceso,
      fecha: latest.fecha_hora,
      operador: latest.operador,
      movimientos: movimientos.length,
      pendientes: pendientes.length,
      estado: pendientes.length > 0 ? 'pendiente' : 'completo',
    });
  }
  return rows.sort((a, b) => a.serie.localeCompare(b.serie, 'es', { numeric: true }));
}
