import { AlertCircle, CheckCircle2, Circle, Loader2, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { ResetStepProgress } from '@/services/productionResetService';
import { formatPercent } from '@/lib/percentFormat';

export type ResetRunStatus = 'running' | 'success' | 'error';

interface ResetProductionProgressModalProps {
  title: string;
  steps: ResetStepProgress[];
  status: ResetRunStatus;
  error: string | null;
  onClose: () => void;
}

export function ResetProductionProgressModal({ title, steps, status, error, onClose }: ResetProductionProgressModalProps) {
  const verified = steps.filter((step) => step.status === 'verificado').length;
  const percentage = steps.length === 0 ? 0 : (verified / steps.length) * 100;
  const running = status === 'running';

  return (
    <Modal title={title} onClose={() => { if (!running) onClose(); }} size="wide">
      <div className="space-y-6 p-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-primary">
              {status === 'success' ? 'Reinicio completado y verificado' : status === 'error' ? 'El reinicio se detuvo' : 'Reiniciando datos...'}
            </span>
            <span className="font-semibold tabular-nums text-primary">{formatPercent(percentage)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${status === 'error' ? 'bg-destructive' : 'bg-accent'}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {verified} de {steps.length} pasos verificados
          </p>
        </div>

        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-4 px-4 py-3 transition-colors duration-300">
              <StepIcon status={step.status} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${step.status === 'pendiente' ? 'text-muted-foreground' : 'text-primary'}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {step.status === 'pendiente' && 'En espera'}
                  {step.status === 'en_curso' && `Lote ${step.lotes + 1} en proceso`}
                  {step.status === 'verificado' && `Verificado en ${step.lotes} ${step.lotes === 1 ? 'lote' : 'lotes'}`}
                </p>
              </div>
              <span className="text-right text-sm font-semibold tabular-nums text-primary">
                {step.eliminados.toLocaleString('es-MX')}
                <span className="block text-xs font-normal text-muted-foreground">registros</span>
              </span>
            </li>
          ))}
        </ol>

        {running && (
          <p className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2.5 text-xs text-accent">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            No cierres esta ventana mientras el proceso avanza.
          </p>
        )}

        {status === 'success' && (
          <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Todos los pasos se verificaron y la producción se actualizó en las pantallas abiertas.
          </p>
        )}

        {status === 'error' && error && (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <p className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
            <p className="text-xs">Los pasos ya completados quedaron guardados. Puedes volver a iniciar el reinicio y continuará sin duplicar nada.</p>
          </div>
        )}

        {!running && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function StepIcon({ status }: { status: ResetStepProgress['status'] }) {
  if (status === 'verificado') return <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />;
  if (status === 'en_curso') return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" />;
  return <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" />;
}
