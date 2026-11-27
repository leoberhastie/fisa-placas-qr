import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileCode2, Loader2, Upload } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import {
  restoreSqlBackup,
  SqlRestoreError,
  parseSqlBackup,
  type SqlRestoreProgress,
  type SqlRestoreResult,
} from '@/services/sqlRestoreService';

interface QueuedFile {
  name: string;
  content: string;
  tabla: string;
  parte: number;
  dePartes: number;
  rowCount: number;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`No se pudo leer el archivo ${file.name}.`));
    reader.readAsText(file);
  });
}

export function DatabaseRestoreSection() {
  const { profile, session } = useAuth();
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SqlRestoreProgress | null>(null);
  const [result, setResult] = useState<SqlRestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = profile?.role === 'admin';

  const handleFilesPicked = async (fileList: FileList | null) => {
    setParseError(null);
    setResult(null);
    setError(null);
    if (!fileList || fileList.length === 0) return;
    const parsed: QueuedFile[] = [];
    try {
      for (const file of Array.from(fileList)) {
        const content = await readFileAsText(file);
        const p = parseSqlBackup(content, file.name);
        parsed.push({ name: file.name, content, ...p });
      }
      parsed.sort((a, b) => a.tabla.localeCompare(b.tabla) || a.parte - b.parte);
      setQueued(parsed);
    } catch (err) {
      setQueued([]);
      setParseError(err instanceof Error ? err.message : 'No se pudo leer el archivo seleccionado.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const res = await restoreSqlBackup({
        files: queued.map((q) => ({ name: q.name, content: q.content })),
        onProgress: (p) => setProgress({ ...p }),
      });
      setResult(res);
      setQueued([]);
    } catch (err) {
      setError(
        err instanceof SqlRestoreError
          ? `${err.fileName ? `${err.fileName}: ` : ''}${err.message}`
          : 'No se pudo completar la restauración.',
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const totalQueued = queued.reduce((a, q) => a + q.rowCount, 0);

  if (!isAdmin) {
    return (
      <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
        Solo el administrador puede restaurar respaldos.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Sube los archivos SQL generados por "Respaldo de la base de datos" para insertar sus registros en la
        base de datos. Puedes seleccionar varios archivos a la vez; los registros que ya existan se omiten
        (cada registro tiene identificador único), por lo que subir el mismo archivo dos veces no crea duplicados.
      </p>

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <input
          ref={inputRef}
          type="file"
          accept=".sql,text/plain"
          multiple
          disabled={busy}
          onChange={(e) => void handleFilesPicked(e.target.files)}
          className="hidden"
          id="sql-restore-input"
        />
        <label
          htmlFor="sql-restore-input"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          Seleccionar archivos SQL
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          <FileCode2 className="mr-1 inline h-3.5 w-3.5" />
          Archivos .sql generados por esta aplicación
        </p>
      </div>

      {parseError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{parseError}</p>
        </div>
      )}

      {queued.length > 0 && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-primary">
              {queued.length} archivo(s) listos · {totalQueued.toLocaleString('es-MX')} registros
            </p>
            <button
              type="button"
              onClick={() => setQueued([])}
              disabled={busy}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              Quitar todos
            </button>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {queued.map((q) => (
              <li key={q.name} className="flex items-center justify-between rounded-md bg-card px-3 py-1.5">
                <span className="truncate font-mono">{q.name}</span>
                <span className="ml-3 shrink-0 tabular-nums text-muted-foreground">
                  {q.tabla} · {q.rowCount.toLocaleString('es-MX')} reg.
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? 'Restaurando…' : 'Restaurar registros'}
          </button>
        </div>
      )}

      {progress && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-primary">
              Restaurando {progress.fileName} ({progress.fileIndex + 1} de {progress.fileTotal})
            </span>
            <span className="tabular-nums text-muted-foreground">
              {progress.rowsRestored.toLocaleString('es-MX')} / {progress.rowsInFile.toLocaleString('es-MX')}
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
            <p className="font-semibold">Restauración completada</p>
            <p className="mt-1 text-xs">
              {result.totalRows.toLocaleString('es-MX')} registros procesados ·{' '}
              {Object.entries(result.perTable)
                .map(([t, n]) => `${t}: ${n.toLocaleString('es-MX')}`)
                .join(' · ')}
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
          title="Restaurar registros desde respaldo"
          message={`Se insertarán ${totalQueued.toLocaleString('es-MX')} registros en la base de datos. Los registros con identificador existente se omiten. ¿Continuar?`}
          confirmLabel="Sí, restaurar"
          busy={busy}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
