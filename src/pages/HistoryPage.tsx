import { useMemo, useState } from 'react';
import { RotateCcw, ShieldCheck, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';
import { PlacaHistoryModal } from '@/components/history/PlacaHistoryModal';
import { FilterInput, FilterSelect } from '@/components/filters/FilterControls';
import { ExportMenu } from '@/components/export/ExportMenu';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useHistoryData } from '@/hooks/useHistoryData';
import { useProductions } from '@/hooks/useProductions';
import { isWithinDateRange } from '@/lib/dateKey';
import { PageLoader } from '@/components/ui/PageLoader';
import { exportExcel, exportPdf, type ExportColumn } from '@/lib/exportFiles';
import {
  buildHistoryRows,
  MODALIDAD_LABELS,
  TIPO_LABELS,
  type HistoryRow,
  type HistoryTipo,
} from '@/lib/operationHistory';
import { REOPERATION_PROCESSES, productionDisplayLabel } from '@/types/domain';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

interface Filters {
  tipo: string;
  modalidad: string;
  servicio: string;
  proceso: string;
  caja: string;
  serie: string;
  posicion: string;
  operador: string;
  fechaInicial: string;
  fechaFinal: string;
}

const EMPTY_FILTERS: Filters = {
  tipo: '',
  modalidad: '',
  servicio: '',
  proceso: '',
  caja: '',
  serie: '',
  posicion: '',
  operador: '',
  fechaInicial: '',
  fechaFinal: '',
};

const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const EXPORT_COLUMNS: ExportColumn<HistoryRow>[] = [
  { header: 'Tipo', value: (r) => TIPO_LABELS[r.tipo] },
  { header: 'Modalidad', value: (r) => MODALIDAD_LABELS[r.modalidad] },
  { header: 'Fecha y hora', value: (r) => DATE_FORMATTER.format(new Date(r.fechaIso)) },
  { header: 'Serie', value: (r) => r.serie },
  { header: 'Posición', value: (r) => r.posicion },
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Caja', value: (r) => r.caja },
  { header: 'Proceso', value: (r) => r.proceso },
  { header: 'Operador', value: (r) => r.operador },
  { header: 'Detalle', value: (r) => r.detalle },
];

const TIPO_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'reoperacion', label: TIPO_LABELS.reoperacion },
  { value: 'recuperacion', label: TIPO_LABELS.recuperacion },
  { value: 'importacion', label: TIPO_LABELS.importacion },
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

function describeFilters(f: Filters): string[] {
  const parts: string[] = [];
  if (f.tipo) parts.push(`Tipo ${TIPO_LABELS[f.tipo as HistoryTipo]}`);
  if (f.modalidad) parts.push(`Modalidad ${f.modalidad === 'manual' ? 'Manual' : 'Normal'}`);
  if (f.servicio) parts.push(`Servicio ${f.servicio}`);
  if (f.proceso) parts.push(`Proceso ${f.proceso}`);
  if (f.caja) parts.push(`Caja ${f.caja}`);
  if (f.serie) parts.push(`Serie contiene "${f.serie}"`);
  if (f.posicion) parts.push(`Posición ${f.posicion}`);
  if (f.operador) parts.push(`Operador ${f.operador}`);
  if (f.fechaInicial) parts.push(`Desde ${f.fechaInicial}`);
  if (f.fechaFinal) parts.push(`Hasta ${f.fechaFinal}`);
  return parts;
}

export function HistoryPage({ onNavigate }: ScreenProps) {
  const { profile } = useAuth();
  const { operatorName, selectedProductionId } = useProductionSelection();
  const { productions } = useProductions();
  const { historial, placas, reoperaciones, recuperaciones, loading, error, reload } = useHistoryData(selectedProductionId);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [placaSerie, setPlacaSerie] = useState<string | null>(null);

  const selected = productions.find((item) => item.id === selectedProductionId) ?? null;
  const displayName = operatorName ?? profile?.full_name ?? profile?.email ?? '—';

  const allRows = useMemo(
    () => buildHistoryRows(placas, reoperaciones, recuperaciones, historial),
    [placas, reoperaciones, recuperaciones, historial],
  );

  const options = useMemo(
    () => ({
      servicios: uniqueSorted(allRows.map((r) => r.servicio)),
      cajas: uniqueSorted(allRows.map((r) => r.caja)),
      operadores: uniqueSorted(allRows.map((r) => r.operador)),
    }),
    [allRows],
  );

  const filteredRows = useMemo(() => {
    const serie = filters.serie.trim().toLowerCase();
    const posicion = filters.posicion.trim().toLowerCase();
    return allRows
      .filter((r) => !filters.tipo || r.tipo === filters.tipo)
      .filter((r) => !filters.modalidad || r.modalidad === filters.modalidad)
      .filter((r) => !filters.servicio || r.servicio === filters.servicio)
      .filter((r) => !filters.proceso || r.proceso === filters.proceso)
      .filter((r) => !filters.caja || r.caja === filters.caja)
      .filter((r) => !serie || r.serie.toLowerCase().includes(serie))
      .filter((r) => !posicion || r.posicion.toLowerCase().includes(posicion))
      .filter((r) => !filters.operador || r.operador === filters.operador)
      .filter((r) => isWithinDateRange(r.fechaIso, filters.fechaInicial, filters.fechaFinal));
  }, [allRows, filters]);

  const kpis = useMemo(() => {
    const reop = filteredRows.filter((r) => r.tipo === 'reoperacion').length;
    const recup = filteredRows.filter((r) => r.tipo === 'recuperacion');
    const manuales = recup.filter((r) => r.modalidad === 'manual').length;
    const placasAfectadas = new Set(filteredRows.filter((r) => r.placaId).map((r) => r.placaId)).size;
    return { reop, recuperaciones: recup.length, manuales, normales: recup.length - manuales, placasAfectadas };
  }, [filteredRows]);

  const placaRows = useMemo(
    () => (placaSerie ? allRows.filter((r) => r.serie === placaSerie) : []),
    [allRows, placaSerie],
  );

  const placaData = useMemo(() => {
    if (!placaSerie) return null;
    const placa = placas.find((p) => p.serie === placaSerie) ?? null;
    const reops = placa ? reoperaciones.filter((r) => r.placa_id === placa.id) : [];
    const recups = placa ? recuperaciones.filter((r) => r.placa_id === placa.id) : [];
    const cajaPlacas = placa ? placas.filter((p) => p.numero_caja === placa.numero_caja) : [];
    return { placa, reops, recups, cajaPlacas };
  }, [placaSerie, placas, reoperaciones, recuperaciones]);

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const produccionLabel = selected ? productionDisplayLabel(selected) : '—';

  const exportMeta = () => ({
    title: 'Historial de reoperaciones y recuperaciones',
    fileBase: 'historial',
    produccion: produccionLabel,
    usuario: displayName,
    filtros: describeFilters(filters),
    kpis: [
      { label: 'Reoperaciones', value: kpis.reop },
      { label: 'Recuperaciones', value: kpis.recuperaciones },
      { label: 'Recuperaciones manuales', value: kpis.manuales },
      { label: 'Recuperaciones normales', value: kpis.normales },
      { label: 'Placas afectadas', value: kpis.placasAfectadas },
    ],
  });

  const columns: DataTableColumn<HistoryRow>[] = [
    {
      header: 'Tipo',
      cell: (row) => (
        <span
          className={
            row.tipo === 'reoperacion'
              ? 'inline-flex rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning ring-1 ring-inset ring-warning/20'
              : row.tipo === 'recuperacion'
                ? 'inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success ring-1 ring-inset ring-success/20'
                : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground ring-1 ring-inset ring-muted-foreground/20'
          }
        >
          {TIPO_LABELS[row.tipo]}
        </span>
      ),
    },
    {
      header: 'Modalidad',
      cell: (row) =>
        row.modalidad === 'manual' ? (
          <span className="inline-flex rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Manual</span>
        ) : row.modalidad === 'normal' ? (
          <span className="text-xs font-medium text-muted-foreground">Normal</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    { header: 'Fecha y hora', cell: (row) => DATE_FORMATTER.format(new Date(row.fechaIso)) },
    { header: 'Serie', cell: (row) => <span className="font-mono">{row.serie || '—'}</span> },
    { header: 'Posición', cell: (row) => row.posicion || '—' },
    { header: 'Servicio', cell: (row) => row.servicio || '—' },
    { header: 'Caja', cell: (row) => <span className="font-mono">{row.caja || '—'}</span> },
    { header: 'Proceso', cell: (row) => row.proceso || '—' },
    { header: 'Operador', cell: (row) => row.operador || '—' },
    {
      header: 'Historial',
      cell: (row) =>
        row.serie ? (
          <button
            type="button"
            onClick={() => setPlacaSerie(row.serie)}
            className="text-xs font-semibold text-accent transition hover:text-accent hover:underline"
          >
            Ver placa
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trazabilidad"
        title="Historial"
        description="Reoperaciones, recuperaciones normales y manuales de la producción seleccionada."
        actions={
          <ExportMenu
            disabled={filteredRows.length === 0}
            onExcel={() => exportExcel(exportMeta(), EXPORT_COLUMNS, filteredRows)}
            onPdf={() => exportPdf(exportMeta(), EXPORT_COLUMNS, filteredRows)}
          />
        }
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      <PageLoader loading={loading} error={error} onRetry={() => void reload()} hasData={allRows.length > 0}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiCard icon={RotateCcw} label="Reoperaciones" value={kpis.reop} tone="amber" />
          <KpiCard icon={ShieldCheck} label="Recuperaciones" value={kpis.recuperaciones} tone="emerald" />
          <KpiCard icon={ShieldCheck} label="Manuales" value={kpis.manuales} tone="navy" />
          <KpiCard icon={ShieldCheck} label="Normales" value={kpis.normales} tone="slate" />
          <KpiCard icon={Users} label="Placas afectadas" value={kpis.placasAfectadas} tone="navy" />
        </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        <FilterSelect label="Tipo" value={filters.tipo} onChange={(v) => setFilters({ ...filters, tipo: v })} options={TIPO_OPTIONS} />
        <FilterSelect
          label="Modalidad de recuperación"
          value={filters.modalidad}
          onChange={(v) => setFilters({ ...filters, modalidad: v })}
          options={[
            { value: '', label: 'Todas' },
            { value: 'normal', label: 'Normal' },
            { value: 'manual', label: 'Manual' },
          ]}
        />
        <FilterSelect
          label="Servicio"
          value={filters.servicio}
          onChange={(v) => setFilters({ ...filters, servicio: v })}
          options={[{ value: '', label: 'Todos los servicios' }, ...options.servicios.map((s) => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Proceso"
          value={filters.proceso}
          onChange={(v) => setFilters({ ...filters, proceso: v })}
          options={[{ value: '', label: 'Todos los procesos' }, ...REOPERATION_PROCESSES.map((p) => ({ value: p, label: p }))]}
        />
        <FilterSelect
          label="Caja"
          value={filters.caja}
          onChange={(v) => setFilters({ ...filters, caja: v })}
          options={[{ value: '', label: 'Todas las cajas' }, ...options.cajas.map((c) => ({ value: c, label: c }))]}
        />
        <FilterInput label="Serie" value={filters.serie} placeholder="Buscar serie" onChange={(v) => setFilters({ ...filters, serie: v })} />
        <FilterInput label="Posición" value={filters.posicion} placeholder="FRONTAL o TRASERA" onChange={(v) => setFilters({ ...filters, posicion: v })} />
        <FilterSelect
          label="Operador"
          value={filters.operador}
          onChange={(v) => setFilters({ ...filters, operador: v })}
          options={[{ value: '', label: 'Todos los operadores' }, ...options.operadores.map((o) => ({ value: o, label: o }))]}
        />
        <FilterInput type="date" label="Fecha inicial" value={filters.fechaInicial} onChange={(v) => setFilters({ ...filters, fechaInicial: v })} />
        <FilterInput type="date" label="Fecha final" value={filters.fechaFinal} onChange={(v) => setFilters({ ...filters, fechaFinal: v })} />
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Mostrando {filteredRows.length} de {allRows.length} movimientos
        </span>
        {filtersActive && (
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="font-medium text-accent hover:underline">
            Limpiar filtros
          </button>
        )}
      </div>

      {!loading && !error && (
        <DataTable
          columns={columns}
          rows={filteredRows}
          getRowKey={(row) => row.id}
          emptyTitle="No hay movimientos con estos filtros"
          emptyDescription={
            selected
              ? 'Las reoperaciones y recuperaciones de esta producción aparecerán aquí en orden cronológico.'
              : 'Selecciona una producción para ver su historial.'
          }
        />
      )}
      </PageLoader>

      {placaSerie && placaData && (
        <PlacaHistoryModal
          serie={placaSerie}
          rows={placaRows}
          placa={placaData.placa}
          reoperaciones={placaData.reops}
          recuperaciones={placaData.recups}
          cajaPlacas={placaData.cajaPlacas}
          onClose={() => setPlacaSerie(null)}
        />
      )}
    </div>
  );
}
