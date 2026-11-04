import { useState } from 'react';
import { CheckCircle2, Loader2, Lock, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { markBoxCompleted, reopenBox } from '@/services/metricsService';
import type { BoxMetrics } from '@/lib/operationMetrics';

type BoxActionTarget = Pick<BoxMetrics, 'servicio' | 'caja' | 'estado' | 'completadaManual'>;

interface BoxStatusActionsProps {
  box: BoxActionTarget;
  produccionId: string;
  onChanged: () => void;
}

type PendingAction = 'mark' | 'reopen';

export function BoxStatusActions({ box, produccionId, onChanged }: BoxStatusActionsProps) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const canReopen = Boolean(box.completadaManual);
  const canMark = !canReopen && (box.estado === 'en_proceso' || box.estado === 'completada_ro');

  async function confirmPending() {
    if (!pending) return;
    const isMark = pending === 'mark';
    setBusy(true);
    setError(null);
    try {
      if (isMark) {
        await markBoxCompleted(produccionId, box.servicio, box.caja);
        showToast(`La caja ${box.caja} ahora está completada.`);
      } else {
        await reopenBox(produccionId, box.servicio, box.caja);
        showToast(`La caja ${box.caja} volvió a estar en proceso.`);
      }
      setPending(null);
      onChanged();
    } catch (cause) {
      setPending(null);
      setError(cause instanceof Error ? cause.message : isMark ? 'No se pudo marcar la caja.' : 'No se pudo reabrir la caja.');
    } finally {
      setBusy(false);
    }
  }

  const dialog = pending && (
    <ConfirmDialog
      title={pending === 'mark' ? `¿Marcar la caja ${box.caja} como completada?` : `¿Reabrir la caja ${box.caja}?`}
      message={
        pending === 'mark'
          ? 'La caja pasará a estado completada. Podrás reabrirla después si fue un error.'
          : 'La caja volverá a estado en proceso y podrá volver a revisarse.'
      }
      confirmLabel={pending === 'mark' ? 'Sí, marcar como completada' : 'Sí, reabrir'}
      busy={busy}
      onConfirm={() => void confirmPending()}
      onCancel={() => setPending(null)}
    />
  );

  if (busy) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Procesando" />;

  if (canReopen) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setPending('reopen')}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reabrir
        </button>
        {error && <span role="alert" className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
        {dialog}
      </div>
    );
  }

  if (canMark) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setPending('mark')}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-success/10 px-2.5 py-1 text-xs font-semibold text-success ring-1 ring-inset ring-success/20 transition-colors hover:bg-success/20"
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Marcar completada
        </button>
        {error && <span role="alert" className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
        {dialog}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      Tiene reoperaciones pendientes
    </span>
  );
}
