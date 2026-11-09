import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { OperationStatusBadge, BOX_STATUS_LABELS } from '@/components/metrics/OperationStatusBadge';
import { BoxStatusActions } from '@/components/metrics/BoxStatusActions';
import { ExportMenu } from '@/components/export/ExportMenu';
import { exportExcel, exportPdf, type ExportMeta } from '@/lib/exportFiles';
import { PLACA_MOVEMENT_EXPORT_COLUMNS } from '@/lib/operationExportColumns';
import { fetchBoxPlacaMovements } from '@/services/metricsService';
import type { BoxMetrics } from '@/lib/operationMetrics';
import type { PlacaMovementRow } from '@/lib/placaMovements';

interface BoxDetailModalProps {
  box: BoxMetrics;
  productionId: string;
  soloPendientes: boolean;
  exportMeta: ExportMeta;
  onClose: () => void;
  onChanged?: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function BoxDetailModal({ box, productionId, soloPendientes, exportMeta, onClose, onChanged }: BoxDetailModalProps) {
  const [rows, setRows] = useState<PlacaMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchBoxPlacaMovements(productionId, box.servicio, box.caja)
      .then((data) => { if (active) setRows(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el detalle de la caja.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [box.caja, box.servicio, productionId]);

  const visibleRows = soloPendientes ? rows.filter((row) => row.estado === 'pendiente') : rows;

  return (
    <Modal title={`Detalle de caja ${box.caja}`} onClose={onClose} size="wide">
      <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado de la caja</p>
            <div className="mt-1.5">
              <OperationStatusBadge status={box.estado} labels={BOX_STATUS_LABELS} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onChanged && (
              <BoxStatusActions box={box} produccionId={productionId} onChanged={onChanged} />
            )}
            <ExportMenu disabled={visibleRows.length === 0} onExcel={() => exportExcel(exportMeta, PLACA_MOVEMENT_EXPORT_COLUMNS, visibleRows)} onPdf={() => exportPdf(exportMeta, PLACA_MOVEMENT_EXPORT_COLUMNS, visibleRows)} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
          <MetricStat label="Servicio" value={box.servicio} nowrap />
          <MetricStat label="Total de placas" value={box.placasCount ?? box.placas.length} />
          <MetricStat label="Serie inicial" value={box.serieInicial ?? '—'} nowrap />
          <MetricStat label="Serie final" value={box.serieFinal ?? '—'} nowrap />
          <MetricStat label="Reoperaciones" value={box.reoperaciones} />
          <MetricStat label="Registros de recuperación" value={box.recuperaciones} />
          <MetricStat label="Registros pendientes" value={box.pendientes} />
        </dl>
        {loading && <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Cargando movimientos de la caja...</p>}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Serie</th><th className="px-3 py-2">Posición</th><th className="px-3 py-2">Proceso</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Operador</th><th className="px-3 py-2">Estado</th></tr></thead>
              <tbody className="divide-y divide-border bg-card">
                {visibleRows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">{soloPendientes ? 'Esta caja no tiene placas pendientes.' : 'Esta caja no tiene placas con reoperaciones.'}</td></tr>}
                {visibleRows.map((row) => <tr key={row.placaId}><td className="px-3 py-2 font-mono">{row.serie}</td><td className="px-3 py-2">{row.posicion}</td><td className="px-3 py-2">{row.proceso}</td><td className="px-3 py-2">{row.fecha ? DATE_FORMAT.format(new Date(row.fecha)) : '—'}</td><td className="px-3 py-2">{row.operador || '—'}</td><td className="px-3 py-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${row.estado === 'pendiente' ? 'bg-destructive/10 text-destructive ring-destructive/20' : 'bg-success/10 text-success ring-success/20'}`}>{row.estado === 'pendiente' ? 'PENDIENTE' : 'RECUPERADA'}</span></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function MetricStat({ label, value, nowrap = false }: { label: string; value: string | number; nowrap?: boolean }) {
  return <div className={nowrap ? 'min-w-0 whitespace-nowrap' : ''}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 overflow-hidden text-ellipsis font-semibold text-primary tabular-nums">{value}</dd></div>;
}
