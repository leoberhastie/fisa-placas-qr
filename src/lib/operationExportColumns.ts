import { BOX_STATUS_LABELS, SERVICE_STATUS_LABELS } from '@/components/metrics/OperationStatusBadge';
import type { ExportColumn } from '@/lib/exportFiles';
import type { BoxMetrics, ServiceMetrics } from '@/lib/operationMetrics';
import { formatPercent } from '@/lib/percentFormat';
import type { PlacaMovementRow } from '@/lib/placaMovements';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const SERVICE_EXPORT_COLUMNS: ExportColumn<ServiceMetrics>[] = [
  { header: 'Servicio', value: (s) => s.servicio },
  { header: 'Tipo', value: (s) => s.tipoServicio },
  { header: 'Series', value: (s) => s.series },
  { header: 'Placas físicas', value: (s) => s.placas },
  { header: 'Cajas', value: (s) => s.cajas },
  { header: 'Cajas con reoperaciones', value: (s) => s.cajasConReoperaciones },
  { header: 'Cajas en proceso', value: (s) => s.cajasEnProceso ?? 0 },
  { header: 'Cajas completadas', value: (s) => s.cajasCompletas },
  { header: 'Cajas completadas RO', value: (s) => s.cajasCompletadasRo ?? 0 },
  { header: 'Reoperaciones', value: (s) => s.reoperaciones },
  { header: 'Recuperaciones', value: (s) => s.recuperaciones },
  { header: 'Pendientes', value: (s) => s.pendientes },
  { header: 'Porcentaje de recuperación', value: (s) => formatPercent(s.porcentajeRecuperacion) },
  { header: 'Estado', value: (s) => SERVICE_STATUS_LABELS[s.estado] },
];

export const BOX_EXPORT_COLUMNS: ExportColumn<BoxMetrics>[] = [
  { header: 'Servicio', value: (b) => b.servicio },
  { header: 'Caja', value: (b) => b.caja },
  { header: 'Total de placas', value: (b) => b.placasCount ?? b.placas.length },
  { header: 'Placas afectadas', value: (b) => b.placasAfectadas },
  { header: 'Reoperaciones', value: (b) => b.reoperaciones },
  { header: 'Pendientes', value: (b) => b.pendientes },
  { header: 'Recuperaciones', value: (b) => b.recuperaciones },
  { header: 'Estado', value: (b) => BOX_STATUS_LABELS[b.estado] },
];

export const PLACA_MOVEMENT_EXPORT_COLUMNS: ExportColumn<PlacaMovementRow>[] = [
  { header: 'Serie', value: (r) => r.serie },
  { header: 'Posición', value: (r) => r.posicion },
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Caja', value: (r) => r.caja },
  { header: 'Proceso', value: (r) => r.proceso },
  { header: 'Fecha y hora', value: (r) => DATE_FORMATTER.format(new Date(r.fecha)) },
  { header: 'Operador', value: (r) => r.operador },
  { header: 'Movimientos', value: (r) => r.movimientos },
  { header: 'Pendientes', value: (r) => r.pendientes },
  { header: 'Estado', value: (r) => (r.estado === 'pendiente' ? 'Pendiente' : 'Recuperada') },
];
