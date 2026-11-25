import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import {
  listBoxPlacasNoCompletadas,
  markBoxCompleted,
  reopenBox,
} from '@/services/metricsService';
import type { BoxMetrics } from '@/lib/operationMetrics';

type BoxActionTarget = Pick<BoxMetrics, 'servicio' | 'caja' | 'estado' | 'completadaManual'>;

interface BoxStatusActionsProps {
  box: BoxActionTarget;
  produccionId: string;
  onChanged: () => void;
}

type PendingAction = 'mark' | 'reopen';
type NoCompletadasInfo = { placas: { placaId: string; serie: string; posicion: string }[] };

export function BoxStatusActions({ box, produccionId, onChanged }: BoxStatusActionsProps) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [responsableInfo, setResponsableInfo] = useState<NoCompletadasInfo | null>(null);

  const canReopen = Boolean(box.completadaManual);
  const canMark = !canReopen && (box.estado === 'en_proceso' || box.estado === 'completada_ro');

  async function confirmPending() {
    if (!pending) return;
    const isMark = pending === 'mark';
    setBusy(true);
    setError(null);
    try {
      if (isMark) {
        const placas = await listBoxPlacasNoCompletadas(produccionId, box.servicio, box.caja);
        if (placas.length > 0) {
          setPending(null);
          setResponsableInfo({ placas });
          return;
        }
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

  async function confirmCerrarResponsable() {
    if (!responsableInfo) return;
    setBusy(true);
    setError(null);
    try {
      await markBoxCompleted(produccionId, box.servicio, box.caja, true);
      showToast(`La caja ${box.caja} se cerró bajo su responsabilidad.`);
      setResponsableInfo(null);
      onChanged();
    } catch (cause) {
      setResponsableInfo(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cerrar la caja bajo responsabilidad.');
    } finally {
      setBusy(false);
    }
  }

  const dialog = pending && (
    <ConfirmDialog
      title={pending === 'mark' ? `¿Marcar la caja ${box.caja} como completada?` : `¿Reabrir la caja ${box.caja}?`}
      message={
        pending === 'mark'
          ? 'Se verificará que todas las placas estén marcadas como completadas.'
          : 'La caja volverá a estado en proceso y podrá volver a revisarse.'
      }
      confirmLabel={pending === 'mark' ? 'Sí, marcar como completada' : 'Sí, reabrir'}
      busy={busy}
      onConfirm={() => void confirmPending()}
      onCancel={() => setPending(null)}
    />
  );

  const responsableDialog = responsableInfo && (
    <Modal
      title={`Cierre bajo responsabilidad — Caja ${box.caja}`}
      onClose={() => { if (!busy) setResponsableInfo(null); }}
    >
      <div className="space-y-4 px-6 py-6">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">La caja se cerrará bajo su responsabilidad</p>
            <p className="mt-1 text-muted-foreground">
              {responsableInfo.placas.length} placa(s) no están marcadas como completadas. Al confirmar,
              se marcarán como completadas automáticamente y quedará registro del cierre con el listado.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-destructive/30">
          <div className="border-b border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive">
            Placas sin completar ({responsableInfo.placas.length})
          </div>
          <div className="max-h-56 overflow-y-auto">
            <ul className="divide-y divide-border text-sm">
              {responsableInfo.placas.map((p) => (
                <li key={p.placaId} className="flex items-center justify-between gap-4 px-4 py-2">
                  <span className="font-mono text-foreground">{p.serie}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{p.posicion}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setResponsableInfo(null)}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmCerrarResponsable()}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-destructive px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-destructive disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
            Cerrar bajo mi responsabilidad
          </button>
        </div>
      </div>
    </Modal>
  );

  if (busy && !responsableDialog) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Procesando" />;

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
        {responsableDialog}
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
