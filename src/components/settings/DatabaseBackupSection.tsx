import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, Download, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import {
  BACKUP_TABLES,
  createDatabaseBackup,
  type BackupProgress,
  type BackupResult,
} from '@/services/backupService';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso));
}

export function DatabaseBackupSection() {
  const { profile, session } = useAuth();
  const { selectedProductionId } = useProductionSelection();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef(false);

  const handleStart = () => {
    setResult(null);
    setError(null);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    setProgress(null);
    cancelRef.current = false;
    try {
      const displayName = session?.user.email ?? profile?.email ?? 'usuario';
      const res = await createDatabaseBackup(
        displayName,
        (p) => setProgress({ ...p }),
        () => cancelRef.current,
        );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el respaldo.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Genera un respaldo completo de la base de datos y descárgalo a tu computadora como archivo JSON.
        Incluye todas las producciones, placas, reoperaciones, recuperaciones, completados, cierres de caja,
        historial y configuración. El proceso se ejecuta desde tu navegador y puede tardar unos minutos
        según el volumen de datos.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? 'Generando respaldo…' : 'Generar respaldo'}
        </button>
        <span className="text-xs text-muted-foreground">
          {BACKUP_TABLES.length} tablas · datos de todas las producciones
        </span>
      </div>

      {progress && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-primary">
              Leyendo {progress.table} ({progress.tableIndex + 1} de {progress.tableTotal})
            </span>
            <span className="tabular-nums text-muted-foreground">
              {progress.rowsInTable > 0 ? `${progress.rowsInTable.toLocaleString('es-MX')} registros` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round(progress.overallPercent)}%` }}
            />
            </div>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Respaldo descargado: {result.fileName}</p>
            <p className="mt-1 text-xs">
              {result.totalRows.toLocaleString('es-MX')} registros en total · {formatBytes(result.sizeBytes)} ·{' '}
              {formatDateTime(new Date().toISOString())}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Generar respaldo de la base de datos"
          message="Se leerán todas las tablas de la base de datos y se descargará un archivo JSON en tu computadora. El proceso no modifica ningún dato. ¿Continuar?"
          confirmLabel="Sí, generar respaldo"
          busy={busy}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
