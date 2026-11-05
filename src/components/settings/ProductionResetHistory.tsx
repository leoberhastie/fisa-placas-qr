import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { listProductionResets, type ProductionResetMode, type ProductionResetRecord } from '@/services/productionResetService';

interface ProductionResetHistoryProps {
  productionId: string;
  version: number;
}

const MODE_LABELS: Record<ProductionResetMode, string> = {
  total: 'Reinicio total',
  movimientos: 'Reinicio de movimientos',
};

export function ProductionResetHistory({ productionId, version }: ProductionResetHistoryProps) {
  const [records, setRecords] = useState<ProductionResetRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    listProductionResets(productionId)
      .then((data) => {
        if (active) setRecords(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el registro.');
      });
    return () => {
      active = false;
    };
  }, [productionId, version]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-primary">Registro de reinicios</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!records && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando registro...
        </p>
      )}

      {records && records.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Esta producción aún no ha sido reiniciada.
        </p>
      )}

      {records && records.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {records.map((record) => {
            const totalRemoved = Object.values(record.resumen).reduce((sum, value) => sum + Number(value), 0);
            const completed = record.estado === 'completado';
            return (
              <li key={record.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-primary">{MODE_LABELS[record.modo]}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(record.iniciado_at).toLocaleString('es-MX')} · {record.usuario_email || 'Usuario desconocido'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {totalRemoved.toLocaleString('es-MX')} registros
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                      completed ? 'bg-success/10 text-success ring-success/30' : 'bg-warning/10 text-warning ring-warning/40'
                    }`}
                  >
                    {completed ? 'Completado' : 'Interrumpido'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
