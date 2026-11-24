import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import { fetchReoperacionesWithPlaca, type ReoperationWithPlaca } from '@/services/metricsService';
import {
  guardarComparacionAuditoria,
  listarAuditoriaComparaciones,
  type AuditoriaComparacion,
  type AuditoriaDetalleItem,
  type AuditoriaResumen,
} from '@/services/auditoriaService';
import { productionDisplayLabel } from '@/types/domain';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

interface SheetData {
  serviceName: string;
  rows: { serie: string; posicion: string }[];
}

interface ComparacionResultado {
  resumen: AuditoriaResumen;
  detalles: AuditoriaDetalleItem[];
}

interface HistorialRow {
  id: string;
  fecha: string;
  usuario: string;
  nombre_archivo: string;
  servicio: string;
  en_archivo_no_bd: number;
  en_bd_no_archivo: number;
  coincidentes: number;
  total_archivo: number;
  total_base_datos: number;
  comparacion: AuditoriaComparacion;
}

const PAGE_SIZE = 15;

export function AuditoriaPage({ onNavigate }: ScreenProps) {
  const { profile } = useAuth();
  const { selectedProductionId, operatorName } = useProductionSelection();
  const { productions } = useProductions();
  const selected = productions.find((item) => item.id === selectedProductionId) ?? null;
  const displayName = operatorName ?? profile?.full_name ?? profile?.email ?? '—';

  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [serieColumn, setSerieColumn] = useState<string>('');
  const [posicionColumn, setPosicionColumn] = useState<string>('');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ComparacionResultado | null>(null);
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [detalleModal, setDetalleModal] = useState<HistorialRow | null>(null);
  const [page, setPage] = useState(1);

  const loadHistorial = useCallback(async () => {
    if (!selectedProductionId) return;
    setHistorialLoading(true);
    try {
      const data = await listarAuditoriaComparaciones(selectedProductionId);
      setHistorial(
        data.map((c) => ({
          id: c.id,
          fecha: new Date(c.fecha).toLocaleString('es-MX'),
          usuario: c.usuario,
          nombre_archivo: c.nombre_archivo,
          servicio: c.resumen.servicio,
          en_archivo_no_bd: c.resumen.en_archivo_no_bd,
          en_bd_no_archivo: c.resumen.en_bd_no_archivo,
          coincidentes: c.resumen.coincidentes,
          total_archivo: c.resumen.total_archivo,
          total_base_datos: c.resumen.total_base_datos,
          comparacion: c,
        })),
      );
    } catch {
      setHistorial([]);
    } finally {
      setHistorialLoading(false);
    }
  }, [selectedProductionId]);

  useEffect(() => {
    void loadHistorial();
  }, [loadHistorial]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResultado(null);
    setError(null);
    setSheets([]);
    setSelectedSheet('');
    setSerieColumn('');
    setPosicionColumn('');
    setAvailableColumns([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const buffer = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetList: SheetData[] = workbook.SheetNames.map((name) => {
          const ws = workbook.Sheets[name];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          return { serviceName: name, rows: [] };
        });
        setSheets(sheetList);

        // Load first sheet columns
        if (workbook.SheetNames.length > 0) {
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
          if (json.length > 0) {
            setAvailableColumns(Object.keys(json[0]));
          }
          setSelectedSheet(workbook.SheetNames[0]);
          workbookRef.current = workbook;
        }
      } catch {
        setError('No se pudo leer el archivo Excel.');
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const wb = workbookRef.current;
    if (!wb) return;
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (json.length > 0) {
      setAvailableColumns(Object.keys(json[0]));
    } else {
      setAvailableColumns([]);
    }
    setSerieColumn('');
    setPosicionColumn('');
  };

  const handleComparar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProductionId || !file || !selectedSheet || !serieColumn || !posicionColumn) return;
    setProcessing(true);
    setError(null);
    try {
      const wb = workbookRef.current;
      if (!wb) throw new Error('Archivo no cargado.');
      const ws = wb.Sheets[selectedSheet];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      // Extract plates from Excel
      const archivoPlacas = new Map<string, { serie: string; posicion: string }>();
      for (const row of json) {
        const serie = String(row[serieColumn] ?? '').trim().toUpperCase();
        const posicion = String(row[posicionColumn] ?? '').trim().toUpperCase();
        if (serie) {
          archivoPlacas.set(`${serie}|${posicion}`, { serie, posicion });
        }
      }

      // Fetch pending reoperations from DB for this production
      const reoperaciones = await fetchReoperacionesWithPlaca(selectedProductionId);
      const pendientes = reoperaciones.filter((r) => r.estado === 'pendiente' && r.servicio === selectedSheet.trim().toUpperCase());

      const bdPlacas = new Map<string, { serie: string; posicion: string }>();
      for (const r of pendientes) {
        const serie = r.serie.trim().toUpperCase();
        const posicion = r.posicion.trim().toUpperCase();
        bdPlacas.set(`${serie}|${posicion}`, { serie, posicion });
      }

      // Compare
      const detalles: AuditoriaDetalleItem[] = [];
      let coincidentes = 0;
      let enArchivoNoBd = 0;
      let enBdNoArchivo = 0;

      for (const [key, val] of archivoPlacas) {
        if (bdPlacas.has(key)) {
          coincidentes++;
          detalles.push({ serie: val.serie, posicion: val.posicion, estado: 'coincide' });
        } else {
          enArchivoNoBd++;
          detalles.push({ serie: val.serie, posicion: val.posicion, estado: 'solo_archivo' });
        }
      }
      for (const [key, val] of bdPlacas) {
        if (!archivoPlacas.has(key)) {
          enBdNoArchivo++;
          detalles.push({ serie: val.serie, posicion: val.posicion, estado: 'solo_bd' });
        }
      }

      const resumen: AuditoriaResumen = {
        total_archivo: archivoPlacas.size,
        total_base_datos: bdPlacas.size,
        en_archivo_no_bd: enArchivoNoBd,
        en_bd_no_archivo: enBdNoArchivo,
        coincidentes,
        servicio: selectedSheet.trim().toUpperCase(),
      };

      setResultado({ resumen, detalles });

      // Guardar en historial
      await guardarComparacionAuditoria(
        selectedProductionId,
        displayName,
        file.name,
        resumen,
        detalles,
      );
      void loadHistorial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al comparar.');
    } finally {
      setProcessing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(historial.length / PAGE_SIZE));
  const paginatedHistorial = historial.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const detalleColumns: DataTableColumn<AuditoriaDetalleItem>[] = [
    { header: 'Serie', cell: (row) => <span className="font-mono">{row.serie}</span> },
    { header: 'Posición', cell: (row) => row.posicion },
    {
      header: 'Estado',
      cell: (row) => {
        if (row.estado === 'coincide')
          return <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">Coincide</span>;
        if (row.estado === 'solo_archivo')
          return <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">En archivo, no en BD</span>;
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">En BD, no en archivo</span>;
      },
    },
  ];

  const historialColumns: DataTableColumn<HistorialRow>[] = [
    { header: 'Fecha', cell: (row) => row.fecha },
    { header: 'Usuario', cell: (row) => row.usuario },
    { header: 'Archivo', cell: (row) => <span className="truncate">{row.nombre_archivo}</span> },
    { header: 'Servicio', cell: (row) => row.servicio },
    { header: 'En archivo', cell: (row) => String(row.total_archivo) },
    { header: 'Coincidentes', cell: (row) => <span className="font-semibold text-success">{row.coincidentes}</span> },
    { header: 'Solo archivo', cell: (row) => <span className="font-semibold text-warning">{row.en_archivo_no_bd}</span> },
    { header: 'Solo BD', cell: (row) => <span className="font-semibold text-destructive">{row.en_bd_no_archivo}</span> },
    {
      header: 'Detalle',
      cell: (row) => (
        <button
          type="button"
          onClick={() => setDetalleModal(row)}
          className="text-xs font-medium text-accent hover:underline"
        >
          Ver detalle
        </button>
      ),
    },
  ];

  if (!selectedProductionId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Verificación" title="Auditoría de reoperaciones" description="Compara un archivo Excel con los registros de la base de datos." />
        <SelectedProductionBanner onNavigate={onNavigate} />
        <div className="rounded-2xl border border-dashed border-warning/30 bg-warning/10 p-6 text-center">
          <p className="font-medium text-warning">Selecciona una producción para usar la auditoría.</p>
          <button
            type="button"
            onClick={() => onNavigate('/producciones')}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary"
          >
            Ir a producciones
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verificación"
        title="Auditoría de reoperaciones"
        description={
          selected
            ? `Compara un archivo Excel con las reoperaciones pendientes de ${productionDisplayLabel(selected)}.`
            : 'Compara un archivo Excel con los registros de la base de datos.'
        }
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      {/* Upload section */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary/80">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-primary">Subir archivo Excel</h2>
            <p className="text-sm text-muted-foreground">Cada hoja debe tener el nombre del servicio y las columnas de serie y posición.</p>
          </div>
        </div>

        <form onSubmit={handleComparar} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground/80">Archivo Excel</label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary"
              />
              {file && <span className="shrink-0 text-xs text-muted-foreground">{file.name}</span>}
            </div>
          </div>

          {sheets.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground/80">Hoja (servicio)</label>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  {sheets.map((s) => (
                    <option key={s.serviceName} value={s.serviceName}>{s.serviceName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground/80">Columna de serie</label>
                <select
                  value={serieColumn}
                  onChange={(e) => setSerieColumn(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">Selecciona columna</option>
                  {availableColumns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground/80">Columna de posición</label>
                <select
                  value={posicionColumn}
                  onChange={(e) => setPosicionColumn(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">Selecciona columna</option>
                  {availableColumns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={processing || !file || !selectedSheet || !serieColumn || !posicionColumn}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {processing ? 'Comparando...' : 'Comparar'}
          </button>
        </form>
      </section>

      {/* Resultado */}
      {resultado && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h3 className="text-sm font-semibold text-primary">Resultado de la comparación</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={ClipboardCheck} label="Coincidentes" value={resultado.resumen.coincidentes} tone="emerald" hint="En ambos: archivo y BD." />
            <KpiCard icon={Upload} label="Solo en archivo" value={resultado.resumen.en_archivo_no_bd} tone="amber" hint="En el Excel pero no en la BD." />
            <KpiCard icon={XCircle} label="Solo en BD" value={resultado.resumen.en_bd_no_archivo} tone="red" hint="En la BD pero no en el Excel." />
            <KpiCard icon={FileSpreadsheet} label="Total en archivo" value={resultado.resumen.total_archivo} tone="navy" hint="Total de placas en el Excel." />
          </div>

          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
              Detalle por placa — {resultado.detalles.length} registros
            </div>
            <div className="max-h-96 overflow-y-auto">
              <DataTable
                columns={detalleColumns}
                rows={resultado.detalles}
                emptyMessage="No hay placas para mostrar."
              />
            </div>
          </div>
        </section>
      )}

      {/* Historial */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-primary">Historial de comparaciones</h3>
        </div>
        {historialLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : historial.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay comparaciones registradas.</p>
        ) : (
          <>
            <DataTable
              columns={historialColumns}
              rows={paginatedHistorial}
              emptyMessage="No hay comparaciones."
            />
            {totalPages > 1 && (
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            )}
          </>
        )}
      </section>

      {/* Modal de detalle */}
      {detalleModal && (
        <Modal
          title={`Detalle de comparación — ${detalleModal.servicio}`}
          onClose={() => setDetalleModal(null)}
        >
          <div className="space-y-5 px-6 py-6">
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <Row label="Fecha" value={detalleModal.fecha} />
              <Row label="Usuario" value={detalleModal.usuario} />
              <Row label="Archivo" value={detalleModal.nombre_archivo} />
              <Row label="Servicio" value={detalleModal.servicio} />
              <Row label="Total en archivo" value={String(detalleModal.total_archivo)} />
              <Row label="Total en BD" value={String(detalleModal.total_base_datos)} />
              <Row label="Coincidentes" value={<span className="font-semibold text-success">{detalleModal.coincidentes}</span>} />
              <Row label="Solo en archivo" value={<span className="font-semibold text-warning">{detalleModal.en_archivo_no_bd}</span>} />
              <Row label="Solo en BD" value={<span className="font-semibold text-destructive">{detalleModal.en_bd_no_archivo}</span>} />
            </dl>

            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
                Detalle por placa
              </div>
              <div className="max-h-72 overflow-y-auto">
                <DataTable
                  columns={detalleColumns}
                  rows={detalleModal.comparacion.detalles}
                  emptyMessage="No hay datos."
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDetalleModal(null)}
              className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary"
            >
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-primary">{value}</dd>
    </div>
  );
}
