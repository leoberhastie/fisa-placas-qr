import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import {
  importMasterServices,
  listImportRecords,
  listServiceNames,
  readMasterWorkbook,
  type ImportRecord,
  type MasterImportProgress,
  type MasterServiceSheet,
} from '@/services/masterImportService';
import type { ServiceType } from '@/types/domain';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const ESTADO_LABELS: Record<string, string> = {
  completada: 'Completada',
  con_errores: 'Con errores',
  fallida: 'Fallida',
  pendiente: 'Pendiente',
};

export function ExcelImportSection() {
  const { selectedProductionId } = useProductionSelection();
  const { reload: reloadProductions } = useProductions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<MasterServiceSheet[] | null>(null);
  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<MasterImportProgress | null>(null);

  const loadContext = useCallback(async () => {
    if (!selectedProductionId) {
      setExistingNames([]);
      setHistory([]);
      return;
    }
    try {
      const [names, records] = await Promise.all([
        listServiceNames(selectedProductionId),
        listImportRecords(selectedProductionId),
      ]);
      setExistingNames(names);
      setHistory(records);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la información de la producción.');
    }
  }, [selectedProductionId]);

  useEffect(() => {
    setSheets(null);
    setFileName('');
    setSuccess(null);
    setError(null);
    void loadContext();
  }, [loadContext]);

  const updateTipo = (index: number, tipo: ServiceType) => {
    setSheets((current) => current?.map((sheet, sheetIndex) => (sheetIndex === index ? { ...sheet, tipo } : sheet)) ?? null);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);
    setProgress(null);
    setSheets(null);
    setFileName(file.name);

    if (!selectedProductionId) {
      setError('Selecciona una producción antes de importar.');
      return;
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      setError('El archivo debe ser Excel (.xlsx o .xls).');
      return;
    }

    setParsing(true);
    try {
      setSheets(await readMasterWorkbook(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo.');
    } finally {
      setParsing(false);
    }
  };

  const isBlocked = (sheet: MasterServiceSheet) => sheet.errors.length > 0 || existingNames.includes(sheet.nombre);
  const canImport = Boolean(sheets && sheets.length > 0 && !sheets.some(isBlocked) && selectedProductionId);

  const handleImport = async () => {
    if (!sheets || !selectedProductionId || !canImport) return;
    setImporting(true);
    setError(null);
    setSuccess(null);
    setProgress(null);
    try {
      const result = await importMasterServices(selectedProductionId, fileName, sheets, setProgress);
      setSuccess(`${result.servicios} servicios importados con ${result.placas} placas físicas.`);
      setSheets(null);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      void reloadProductions();
      await loadContext();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo importar el archivo maestro.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h3 className="text-base font-semibold text-primary">Importar archivo maestro</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Cada hoja del Excel es un servicio y su nombre se toma de la hoja. Cada hoja debe tener columnas de consecutivo y serie.
              Los servicios con MOTO o REMOLQUE se marcan como Pieza (una placa por serie); los demás como Juego (dos placas por serie).
            </p>
          </div>
        </div>

        {!selectedProductionId && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Selecciona una producción para poder importar su archivo maestro.
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={!selectedProductionId || importing}
          onChange={(event) => void handleFileChange(event)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        />

        {parsing && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Analizando hojas...</p>}
        {progress && importing && (
          <ImportProgress progress={progress} />
        )}
        {error && <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}
        {success && <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />{success}</p>}

        {sheets && (
          <div className="space-y-3">
            {sheets.map((sheet, index) => {
              const duplicated = existingNames.includes(sheet.nombre);
              const physicalPlates = sheet.placas.length * (sheet.tipo === 'JGS' ? 2 : 1);
              return (
                <div key={`${sheet.nombre}-${index}`} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-primary">{sheet.nombre || 'Hoja sin nombre'}</p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {sheet.placas.length} series · {physicalPlates} placas físicas
                    </p>
                    {duplicated && <p className="mt-1 text-xs text-destructive">Este servicio ya existe en la producción.</p>}
                    {sheet.errors.map((item) => (
                      <p key={item} className="mt-1 text-xs text-destructive">{item}</p>
                    ))}
                  </div>
                  <select
                    value={sheet.tipo}
                    onChange={(event) => updateTipo(index, event.target.value as ServiceType)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    aria-label={`Tipo de servicio para ${sheet.nombre}`}
                  >
                    <option value="PZ">Pieza (PZ)</option>
                    <option value="JGS">Juego (JGS)</option>
                  </select>
                  <span className={`justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:justify-self-end ${isBlocked(sheet) ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                    {isBlocked(sheet) ? 'Revisar' : 'Lista'}
                  </span>
                </div>
              );
            })}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={!canImport || importing}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importing ? 'Importando...' : `Importar ${sheets.length} servicios`}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedProductionId && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-base font-semibold text-primary">Historial de importaciones</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta producción aún no tiene importaciones.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((record) => (
                <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">{record.nombre_archivo || 'Archivo sin nombre'}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {DATE_FORMATTER.format(new Date(record.fecha_importacion))} · {record.cantidad_registros} placas · {ESTADO_LABELS[record.estado_importacion] ?? record.estado_importacion}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ImportProgress({ progress }: { progress: MasterImportProgress }) {
  const percentage = progress.totalSeries === 0 ? 0 : Math.round((progress.processedSeries / progress.totalSeries) * 100);
  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-3 text-sm text-accent">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Importando {progress.serviceName}</span>
        <span className="font-semibold tabular-nums">{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-accent/15"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percentage}%` }} /></div>
      <p className="text-xs text-accent">Servicio {progress.serviceIndex} de {progress.totalServices} · lote {progress.batchIndex} de {progress.totalBatches} · {progress.processedSeries.toLocaleString('es-MX')} de {progress.totalSeries.toLocaleString('es-MX')} series</p>
    </div>
  );
}
