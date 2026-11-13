import { useState } from 'react';
import { AlertCircle, Loader2, Undo2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ANULACION_MOTIVOS, type AnulacionMotivo, type Reoperation } from '@/types/domain';

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

interface AnularReoperacionModalProps {
  reoperacion: Reoperation;
  serie: string;
  posicion: string;
  servicio: string;
  caja: string;
  onClose: () => void;
  onConfirm: (motivo: AnulacionMotivo) => Promise<void>;
}

export function AnularReoperacionModal({
  reoperacion,
  serie,
  posicion,
  servicio,
  caja,
  onClose,
  onConfirm,
}: AnularReoperacionModalProps) {
  const [motivo, setMotivo] = useState<AnulacionMotivo>(ANULACION_MOTIVOS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(motivo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la reoperación.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Quitar reoperación" onClose={onClose} closeDisabled={submitting}>
      <div className="space-y-5 px-6 py-6">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Esta acción quitará todas las reoperaciones de esta placa.</p>
            <p className="mt-1 text-xs">
              Quedarán registradas en el historial de anulaciones y no se contabilizarán en las métricas.
              Si la placa ya fue recuperada, no se puede anular.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <dl className="divide-y divide-border rounded-lg border border-border text-sm">
          <Row label="Serie" value={<span className="font-mono">{serie}</span>} />
          <Row label="Posición" value={posicion} />
          <Row label="Servicio" value={servicio} />
          <Row label="Caja" value={caja} />
          <Row label="Proceso" value={reoperacion.proceso || '—'} />
          <Row label="Fecha de reoperación" value={new Date(reoperacion.fecha_hora).toLocaleString('es-MX')} />
          <Row label="Operador" value={reoperacion.operador || '—'} />
        </dl>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground/80">Motivo de anulación</label>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as AnulacionMotivo)}
            className={INPUT_CLASS}
            disabled={submitting}
          >
            {ANULACION_MOTIVOS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-destructive disabled:opacity-70"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            {submitting ? 'Anulando...' : 'Confirmar anulación'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-primary">{value}</dd>
    </div>
  );
}
