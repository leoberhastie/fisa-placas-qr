import { useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { TIPO_LABELS, MODALIDAD_LABELS, type HistoryRow } from '@/lib/operationHistory';

interface PlacaHistoryModalProps {
  serie: string;
  rows: HistoryRow[];
  onClose: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function PlacaHistoryModal({ serie, rows, onClose }: PlacaHistoryModalProps) {
  const timeline = useMemo(
    () => [...rows].sort((a, b) => a.fechaIso.localeCompare(b.fechaIso)),
    [rows],
  );

  return (
    <Modal title={`Historial de la placa ${serie}`} onClose={onClose}>
      {timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta placa no tiene movimientos registrados.</p>
      ) : (
        <ol className="space-y-3">
          {timeline.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-primary">
                  {TIPO_LABELS[row.tipo]}
                  {row.tipo === 'recuperacion' && ` (${MODALIDAD_LABELS[row.modalidad]})`}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{DATE_FORMAT.format(new Date(row.fechaIso))}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {row.proceso ? `Proceso: ${row.proceso} · ` : ''}
                Operador: {row.operador || '—'}
              </p>
              {row.detalle && <p className="mt-1 text-xs text-muted-foreground">{row.detalle}</p>}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
