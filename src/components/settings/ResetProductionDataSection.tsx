import { useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import { useAuth } from '@/context/AuthContext';
import { canManageProductions, productionDisplayLabel } from '@/types/domain';
import { resetProductionData } from '@/services/productionService';
import { useProductionData } from '@/hooks/useProductionData';

export function ResetProductionDataSection() {
  const { profile } = useAuth();
  const { selectedProductionId } = useProductionSelection();
  const { productions } = useProductions();
  const { reload } = useProductionData(selectedProductionId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!canManageProductions(profile?.role ?? 'operador')) return null;

  const selected = productions.find((p) => p.id === selectedProductionId) ?? null;
  const label = selected ? productionDisplayLabel(selected) : '—';

  const handleConfirm = async () => {
    if (!selectedProductionId) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await resetProductionData(selectedProductionId);
      await reload();
      setDone(true);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-destructive">Reiniciar datos de la producción</h2>
          <p className="text-sm text-muted-foreground">
            Elimina todas las placas, reoperaciones, recuperaciones, historial, cajas, servicios e importaciones de la producción activa. La producción en sí no se elimina.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <p className="text-muted-foreground">Producción activa</p>
        <p className="font-semibold text-primary">{label}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {done && (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Los datos de la producción se reiniciaron correctamente.</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => { setDone(false); setConfirmOpen(true); }}
        disabled={!selectedProductionId || busy}
        className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-5 py-3 text-sm font-semibold text-destructive transition hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
        Reiniciar datos
      </button>

      {confirmOpen && (
        <ConfirmDialog
          title="Confirmar reinicio de datos"
          message={
            <div className="space-y-2">
              <p>Estás a punto de eliminar <strong>todos</strong> los datos operativos de la producción <strong>{label}</strong>:</p>
              <ul className="list-disc pl-5 text-xs">
                <li>Placas</li>
                <li>Reoperaciones y recuperaciones</li>
                <li>Historial de operaciones</li>
                <li>Cajas y servicios asignados</li>
                <li>Registros de importación</li>
              </ul>
              <p className="font-medium text-destructive">Esta acción no se puede deshacer.</p>
            </div>
          }
          confirmLabel={busy ? 'Reiniciando...' : 'Sí, reiniciar todo'}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => !busy && setConfirmOpen(false)}
        />
      )}
    </section>
  );
}
