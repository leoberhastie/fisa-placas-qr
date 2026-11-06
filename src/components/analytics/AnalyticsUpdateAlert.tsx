import { RefreshCw } from 'lucide-react';

interface AnalyticsUpdateAlertProps {
  visible: boolean;
  onRefresh: () => void;
}

export function AnalyticsUpdateAlert({ visible, onRefresh }: AnalyticsUpdateAlertProps) {
  if (!visible) return null;

  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-warning">Hay datos nuevos</p>
        <p className="text-sm text-foreground/80">
          Se registraron cambios en las producciones activas desde la última carga. Actualiza para ver las cifras al día.
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="flex items-center justify-center gap-2 self-start rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-warning/90 sm:self-auto"
      >
        <RefreshCw className="h-4 w-4" />
        Actualizar datos
      </button>
    </div>
  );
}
