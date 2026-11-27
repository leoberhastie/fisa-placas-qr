import { useRef, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, Download, FileCode2, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import {
  generateSqlBackup,
  ROWS_PER_FILE,
  type SqlBackupProgress,
  type SqlBackupResult,
} from '@/services/sqlBackupService';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type RangeMode = 'dia' | 'rango';

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DatabaseBackupSection() {
  const { profile, session } = useAuth();
  const [mode, setMode] = useState<RangeMode>('dia');
  const [dia, setDia] = useState(todayIso());
  const [desde, setDesde] = useState(todayIso());
  const [hasta, setHasta] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SqlBackupProgress | null>(null);
  const [result, setResult] = useState<SqlBackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef(false);

  const rangoValido = mode === 'dia' || desde <= hasta;

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
      const res = await generateSqlBackup({
        options: {
          desde: mode === 'dia' ? dia : desde,
          hasta: mode === 'dia' ? dia : hasta,
          usuario: displayName,
        },
        onProgress: (p) => setProgress({ ...p }),
        shouldCancel: () => cancelRef.current,
      });
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
        Genera archivos SQL con los registros de un día o rango de días. Cada archivo contiene máximo{' '}
        {ROWS_PER_FILE.toLocaleString('es-MX')} registros de una tabla y se descarga numerado, por ejemplo{' '}
        <span className="font-mono text-xs">respaldo_27-11-26_09-20-01_(1).sql</span>. Los archivos incluyen el
        esquema de tablas, por lo que pueden cargarse en un sistema PostgreSQL local o restaurarse aquí mismo
        con la sección "Restaurar respaldo".
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Modo</label>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setMode('dia')}
              disabled={busy}
              className={`flex-1 px-3 py-2 text-sm font-medium transition ${mode === 'dia' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted/60'}`}
            >
              Un día
            </button>
            <button
              type="button"
              onClick={() => setMode('rango')}
              disabled={busy}
              className={`flex-1 px-3 py-2 text-sm font-medium transition ${mode === 'rango' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted/60'}`}
            >
              Rango
            </button>
          </div>
        </div>
        {mode === 'dia' ? (
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Día</label>
            <input
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary"
            />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary"
              />
            </div>
          </>
        )}
      </div>

      {!rangoValido && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          La fecha "Desde" debe ser anterior o igual a la fecha "Hasta".
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleStart}
          disabled={busy || !rangoValido}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? 'Generando respaldo…' : 'Generar respaldo SQL'}
        </button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {mode === 'dia'
            ? new Date(`${dia}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'long' })
            : `${desde} → ${hasta}`}
        </span>
      </div>

      {progress && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-primary">
              {progress.table
                ? `Leyendo ${progress.table} (${progress.tableIndex + 1} de ${progress.tableTotal})`
                : 'Preparando descarga…'}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {progress.filesCompleted > 0 ? `${progress.filesCompleted} archivo(s) listos · ` : ''}
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
          <div className="min-w-0">
            <p className="font-semibold">
              {result.files.length} archivo(s) SQL descargado(s)
            </p>
            <p className="mt-1 text-xs">
              {result.totalRows.toLocaleString('es-MX')} registros en total ·{' '}
              {Object.entries(result.tablaCounts)
                .filter(([, n]) => n > 0)
                .map(([t, n]) => `${t}: ${n.toLocaleString('es-MX')}`)
                .join(' · ')}
            </p>
            <p className="mt-1 text-xs">
              Tamaño combinado: {formatBytes(result.files.reduce((a, f) => a + f.sql.length, 0))}
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
          title="Generar respaldo SQL"
          message={`Se leerán las tablas filtrando por ${mode === 'dia' ? `el día ${dia}` : `el rango ${desde} a ${hasta}`} y se descargarán archivos SQL (máximo ${ROWS_PER_FILE} registros por archivo) en tu computadora. El proceso no modifica ningún dato. ¿Continuar?`}
          confirmLabel="Sí, generar respaldo"
          busy={busy}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
