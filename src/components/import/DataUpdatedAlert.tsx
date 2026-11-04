import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useProductionVersions } from '@/context/DataSyncContext';

interface DataUpdatedAlertProps {
  produccionId: string | null;
  loadedVersion: number | null;
  onRefresh: () => void;
}

export function DataUpdatedAlert({ produccionId, loadedVersion, onRefresh }: DataUpdatedAlertProps) {
  const versions = useProductionVersions();
  const [dismissedVersion, setDismissedVersion] = useState<number | null>(null);

  const latestVersion = produccionId ? versions[produccionId] : undefined;
  if (!produccionId || loadedVersion === null || latestVersion === undefined) return null;
  if (latestVersion <= loadedVersion || dismissedVersion === latestVersion) return null;

  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-warning">Hay datos nuevos</p>
        <p className="text-sm text-foreground/80">
          Se registraron cambios en esta producción desde la última carga. Actualiza para ver las cifras al día.
        </p>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center justify-center gap-2 rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-warning/90"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar datos
        </button>
        <button
          type="button"
          onClick={() => setDismissedVersion(latestVersion)}
          aria-label="Cerrar aviso"
          className="rounded-lg p-2 text-warning transition hover:bg-warning/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
