import { useState } from 'react';
import { AlertTriangle, Eraser, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ResetProductionProgressModal, type ResetRunStatus } from '@/components/settings/ResetProductionProgressModal';
import { ProductionResetHistory } from '@/components/settings/ProductionResetHistory';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import { useAuth } from '@/context/AuthContext';
import { useProductionData } from '@/hooks/useProductionData';
import { canManageProductions, productionDisplayLabel } from '@/types/domain';
import {
  buildInitialResetSteps,
  runProductionReset,
  type ProductionResetMode,
  type ResetStepProgress,
} from '@/services/productionResetService';

interface ResetOption {
  mode: ProductionResetMode;
  title: string;
  description: string;
  keeps: string[];
  removes: string[];
  tone: 'destructive' | 'warning';
}

const RESET_OPTIONS: ResetOption[] = [
  {
    mode: 'movimientos',
    title: 'Borrar solo movimientos',
    description: 'Deja la producción como si solo se hubiera subido el archivo de placas maestras.',
    keeps: ['Series', 'Servicios y su pertenencia', 'Registros de importación'],
    removes: ['Cajas registradas y completadas', 'Caja asignada a cada placa', 'Reoperaciones y recuperaciones', 'Historial de operaciones'],
    tone: 'warning',
  },
  {
    mode: 'total',
    title: 'Eliminar todo',
    description: 'Elimina todos los datos operativos de la producción, incluidas series, servicios e importaciones.',
    keeps: ['La producción en sí'],
    removes: ['Placas', 'Cajas, servicios y series', 'Importaciones', 'Reoperaciones, recuperaciones e historial'],
    tone: 'destructive',
  },
];

interface ResetRun {
  mode: ProductionResetMode;
  status: ResetRunStatus;
  steps: ResetStepProgress[];
  error: string | null;
}

const OPTION_STYLES: Record<ResetOption['tone'], { card: string; icon: string; button: string }> = {
  warning: {
    card: 'border-warning/40 bg-warning/5',
    icon: 'bg-warning/15 text-warning',
    button: 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20',
  },
  destructive: {
    card: 'border-destructive/30 bg-destructive/5',
    icon: 'bg-destructive/15 text-destructive',
    button: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
  },
};

export function ResetProductionDataSection() {
  const { profile } = useAuth();
  const { selectedProductionId } = useProductionSelection();
  const { productions } = useProductions();
  const { reload } = useProductionData(selectedProductionId);
  const [pendingMode, setPendingMode] = useState<ProductionResetMode | null>(null);
  const [run, setRun] = useState<ResetRun | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  if (!canManageProductions(profile?.role ?? 'operador')) return null;

  const selected = productions.find((p) => p.id === selectedProductionId) ?? null;
  const label = selected ? productionDisplayLabel(selected) : '—';
  const running = run?.status === 'running';
  const pendingOption = RESET_OPTIONS.find((option) => option.mode === pendingMode) ?? null;

  const handleConfirm = async () => {
    if (!selectedProductionId || !pendingMode) return;
    const mode = pendingMode;
    setPendingMode(null);
    setRun({ mode, status: 'running', steps: buildInitialResetSteps(mode), error: null });
    try {
      await runProductionReset(selectedProductionId, mode, (steps) => {
        setRun((current) => (current ? { ...current, steps } : current));
      });
      setRun((current) => (current ? { ...current, status: 'success' } : current));
      setHistoryVersion((version) => version + 1);
      await reload();
    } catch (err) {
      setRun((current) =>
        current
          ? { ...current, status: 'error', error: err instanceof Error ? err.message : 'Ocurrió un error inesperado.' }
          : current,
      );
      setHistoryVersion((version) => version + 1);
    }
  };

  return (
    <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-primary">Reiniciar datos de la producción</h2>
          <p className="text-sm text-muted-foreground">
            El proceso se ejecuta por lotes y verifica cada paso. Cada reinicio queda registrado con fecha y usuario.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <p className="text-muted-foreground">Producción activa</p>
        <p className="font-semibold text-primary">{label}</p>
      </div>

      {!selectedProductionId && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Selecciona una producción para poder reiniciar sus datos.</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {RESET_OPTIONS.map((option) => {
          const styles = OPTION_STYLES[option.tone];
          return (
            <div key={option.mode} className={`flex flex-col gap-4 rounded-xl border p-5 ${styles.card}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${styles.icon}`}>
                  <Eraser className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-primary">{option.title}</p>
              </div>
              <p className="text-sm text-muted-foreground">{option.description}</p>
              <div className="grid gap-3 text-xs sm:grid-cols-2 md:grid-cols-1">
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Se conserva</p>
                  <ul className="space-y-0.5 text-primary">
                    {option.keeps.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Se elimina</p>
                  <ul className="space-y-0.5 text-primary">
                    {option.removes.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingMode(option.mode)}
                disabled={!selectedProductionId || running}
                className={`mt-auto flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles.button}`}
              >
                {option.title}
              </button>
            </div>
          );
        })}
      </div>

      <ProductionResetHistory productionId={selectedProductionId ?? ''} version={historyVersion} />

      {pendingOption && (
        <ConfirmDialog
          title={`Confirmar: ${pendingOption.title.toLowerCase()}`}
          message={
            <div className="space-y-2">
              <p>
                Vas a reiniciar la producción <strong>{label}</strong>. Se eliminarán:
              </p>
              <ul className="list-disc pl-5 text-xs">
                {pendingOption.removes.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p className="font-medium text-destructive">Esta acción no se puede deshacer.</p>
            </div>
          }
          confirmLabel="Sí, reiniciar"
          onConfirm={handleConfirm}
          onCancel={() => setPendingMode(null)}
        />
      )}

      {run && (
        <ResetProductionProgressModal
          title={RESET_OPTIONS.find((option) => option.mode === run.mode)?.title ?? 'Reinicio'}
          steps={run.steps}
          status={run.status}
          error={run.error}
          onClose={() => setRun(null)}
        />
      )}
    </section>
  );
}
