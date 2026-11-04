import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, ArrowRight, Eye } from 'lucide-react';
import {
  assignServiceBoxes,
  getAutoMapping,
  previewBoxSeriesMapping,
  readServiceBoxRows,
  extractHeaders,
  type ColumnMapping,
  type PreviewResult,
  type ServiceBoxImportProgress,
  type ServiceBoxImportRow,
} from '@/services/serviceBoxImportService';
import type { ServiceType } from '@/types/domain';

interface ServiceBoxImportPanelProps {
  productionId: string;
  servicio: string;
  tipo: ServiceType;
  onImported: () => void;
}

const TYPE_LABELS: Record<ServiceType, string> = {
  PZ: 'Pieza (PZ): una placa por serie',
  JGS: 'Juego (JGS): dos placas por serie',
};

const FIELD_LABELS: Array<{ key: keyof ColumnMapping; label: string; required: boolean }> = [
  { key: 'numero_caja', label: 'Número de caja', required: true },
  { key: 'serie_inicial', label: 'Serie inicial', required: true },
  { key: 'serie_final', label: 'Serie final', required: true },
  { key: 'cantidad_series', label: 'Cantidad de series (opcional)', required: false },
  { key: 'cantidad_placas', label: 'Cantidad de placas (opcional)', required: false },
];

type Step = 'idle' | 'mapping' | 'preview';

export function ServiceBoxImportPanel({ productionId, servicio, tipo, onImported }: ServiceBoxImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rows, setRows] = useState<ServiceBoxImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ServiceBoxImportProgress | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setMessage(null);
    setPreview(null);
    setProgress(null);
    setReading(true);
    try {
      const fileHeaders = await extractHeaders(file);
      if (fileHeaders.length === 0) throw new Error('El archivo no tiene encabezados.');
      const autoMapping = getAutoMapping(fileHeaders);
      setHeaders(fileHeaders);
      setMapping(autoMapping);
      setStep('mapping');
      setRows(null);
      setFileName(file.name);
    } catch (cause) {
      setStep('idle');
      setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo.');
    } finally {
      setReading(false);
    }
  };

  const handleMappingChange = (key: keyof ColumnMapping, value: string) => {
    if (!mapping) return;
    if (value === '-1') {
      setMapping({ ...mapping, [key]: null });
    } else {
      setMapping({ ...mapping, [key]: Number(value) });
    }
  };

  const handleConfirmMapping = async () => {
    if (!mapping) return;
    setError(null);
    setReading(true);
    try {
      const file = inputRef.current?.files?.[0];
      if (!file) throw new Error('No se encontró el archivo. Selecciona uno nuevo.');
      const fileRows = await readServiceBoxRows(file, mapping);
      setRows(fileRows);
      setStep('preview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo con el mapeo seleccionado.');
    } finally {
      setReading(false);
    }
  };

  const runPreview = useCallback(async () => {
    if (!rows) return;
    const localErrors = rows.filter((r) => r.errors.length > 0);
    if (localErrors.length > 0) {
      setPreview(null);
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const result = await previewBoxSeriesMapping(productionId, servicio, rows);
      setPreview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo verificar las series contra las placas.');
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }, [rows, productionId, servicio]);

  useEffect(() => {
    if (step === 'preview' && rows) {
      void runPreview();
    }
  }, [step, rows, runPreview]);

  const canSave = useMemo(() => {
    if (!preview || preview.errorCount > 0 || preview.duplicateBoxes || preview.overlappingRanges) {
      return false;
    }
    return true;
  }, [preview]);

  const handleSave = async () => {
    if (!rows || !canSave) return;
    setSaving(true);
    setError(null);
    setProgress(null);
    try {
      const result = await assignServiceBoxes(productionId, servicio, tipo, rows, fileName, setProgress);
      setMessage(`${result.cajas} cajas asignadas: ${result.series} series y ${result.placas} placas físicas.`);
      resetToIdle();
      onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la asignación de cajas.');
    } finally {
      setSaving(false);
    }
  };

  const resetToIdle = () => {
    setStep('idle');
    setRows(null);
    setPreview(null);
    setMapping(null);
    setHeaders([]);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-semibold text-primary">Importar cajas de {servicio}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            El Excel debe traer número de caja, serie inicial y serie final. El sistema resuelve
            automáticamente a qué consecutivos corresponden esas series.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Tipo: {TYPE_LABELS[tipo]}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Archivo Excel</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={reading || previewing || saving}
            onChange={(event) => void handleFile(event)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
          />
        </div>
        {step === 'idle' && (
          <span className="hidden sm:block text-xs text-muted-foreground">Selecciona un archivo para comenzar</span>
        )}
      </div>

      {reading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Leyendo archivo...</p>}
      {previewing && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Verificando series contra las placas del servicio...</p>}
      {saving && progress && <BoxImportProgress progress={progress} />}
      {message && <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />{message}</p>}
      {error && <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}

      {step === 'mapping' && headers.length > 0 && mapping && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-accent" />
            <p className="text-sm font-semibold text-primary">Confirma qué columna corresponde a cada dato</p>
          </div>
          <p className="text-xs text-muted-foreground">
            El sistema detectó automáticamente las columnas. Revisa que sean correctas antes de continuar.
            Si tu Excel no tiene alguna columna opcional, selecciona "No incluye".
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_LABELS.map(({ key, label, required }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}{required && <span className="text-destructive"> *</span>}
                </label>
                <select
                  value={String(mapping[key] ?? -1)}
                  onChange={(e) => handleMappingChange(key, e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  {!required && <option value="-1">No incluye</option>}
                  {headers.map((header, index) => (
                    <option key={index} value={index}>{header || `Columna ${index + 1}`}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {(mapping.numero_caja < 0 || mapping.serie_inicial < 0 || mapping.serie_final < 0) && (
            <p className="text-xs text-destructive">Faltan columnas obligatorias por asignar.</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetToIdle}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmMapping()}
              disabled={mapping.numero_caja < 0 || mapping.serie_inicial < 0 || mapping.serie_final < 0 || reading}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <SummaryStat label="Cajas" value={preview.rows.filter((r) => r.error === null).length} />
            <SummaryStat label={tipo === 'JGS' ? 'Juegos' : 'Piezas'} value={preview.totalSeries} />
            <SummaryStat label="Placas físicas" value={preview.totalPlates} />
          </div>

          {preview.errorCount > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <p className="font-semibold">{preview.errorCount} fila(s) con problemas:</p>
              <ul className="mt-1 space-y-0.5">
                {preview.rows.filter((r) => r.error !== null).slice(0, 8).map((r) => (
                  <li key={r.row_index}>
                    Fila {r.row_index} — caja {r.numero_caja || '(vacía)'}: {formatPreviewError(r.error)}
                  </li>
                ))}
                {preview.errorCount > 8 && <li>...y {preview.errorCount - 8} más</li>}
              </ul>
            </div>
          )}

          {preview.duplicateBoxes && (
            <p className="text-xs text-destructive">Hay números de caja repetidos.</p>
          )}
          {preview.overlappingRanges && (
            <p className="text-xs text-destructive">Hay rangos de series superpuestos (las cajas comparten placas).</p>
          )}

          {preview.errorCount === 0 && !preview.duplicateBoxes && !preview.overlappingRanges && (
            <p className="flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="h-4 w-4" />
              Todas las series se encontraron en el servicio. Listo para asignar.
            </p>
          )}

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-xs">
              <thead className="bg-muted/50 text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Fila</th>
                  <th className="px-2 py-1.5 font-semibold">Caja</th>
                  <th className="px-2 py-1.5 font-semibold">Serie inicial</th>
                  <th className="px-2 py-1.5 font-semibold">Serie final</th>
                  <th className="px-2 py-1.5 font-semibold">Consecutivos</th>
                  <th className="px-2 py-1.5 font-semibold">Series</th>
                  <th className="px-2 py-1.5 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {preview.rows.slice(0, 12).map((r) => (
                  <tr key={r.row_index} className={r.error ? 'bg-destructive/10' : ''}>
                    <td className="px-2 py-1.5 tabular-nums">{r.row_index}</td>
                    <td className="px-2 py-1.5 font-mono">{r.numero_caja || '—'}</td>
                    <td className="px-2 py-1.5 font-mono">{r.serie_inicial || '—'}</td>
                    <td className="px-2 py-1.5 font-mono">{r.serie_final || '—'}</td>
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                      {r.consecutivo_inicial !== null && r.consecutivo_final !== null
                        ? `${r.consecutivo_inicial}–${r.consecutivo_final}`
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{r.series_count || '—'}</td>
                    <td className="px-2 py-1.5">
                      {r.error ? (
                        <span className="text-destructive">{formatPreviewError(r.error)}</span>
                      ) : (
                        <span className="text-success">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
                {preview.rows.length > 12 && (
                  <tr><td colSpan={7} className="px-2 py-1.5 text-center text-muted-foreground">...y {preview.rows.length - 12} filas más</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetToIdle}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave || previewing || saving}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {saving ? 'Guardando...' : 'Asignar cajas'}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && !preview && !previewing && rows && rows.some((r) => r.errors.length > 0) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-semibold">Hay filas con errores de formato:</p>
          <ul className="mt-1 space-y-0.5">
            {rows.filter((r) => r.errors.length > 0).slice(0, 8).map((r) => (
              <li key={r.rowIndex}>Fila {r.rowIndex}: {r.errors.join(', ')}</li>
            ))}
            {rows.filter((r) => r.errors.length > 0).length > 8 && (
              <li>...y {rows.filter((r) => r.errors.length > 0).length - 8} más</li>
            )}
          </ul>
          <button
            type="button"
            onClick={resetToIdle}
            className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
          >
            Seleccionar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

function formatPreviewError(error: string | null): string {
  switch (error) {
    case 'serie_inicial_no_encontrada':
      return 'Serie inicial no encontrada en el servicio';
    case 'serie_final_no_encontrada':
      return 'Serie final no encontrada en el servicio';
    case 'rango_invertido':
      return 'La serie final tiene un consecutivo menor que la inicial';
    default:
      return error ?? '';
  }
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums text-primary">{value.toLocaleString('es-MX')}</p></div>;
}

function BoxImportProgress({ progress }: { progress: ServiceBoxImportProgress }) {
  const percentage = progress.totalBoxes === 0 ? 0 : Math.round((progress.processedBoxes / progress.totalBoxes) * 100);
  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-3 text-sm text-accent">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Asignando cajas</span>
        <span className="font-semibold tabular-nums">{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-accent/15"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percentage}%` }} /></div>
      <p className="text-xs text-accent">Lote {progress.batchIndex} de {progress.totalBatches} · {progress.processedBoxes.toLocaleString('es-MX')} de {progress.totalBoxes.toLocaleString('es-MX')} cajas</p>
    </div>
  );
}
