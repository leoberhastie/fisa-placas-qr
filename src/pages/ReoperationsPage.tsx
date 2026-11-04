import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Package, RotateCcw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatusLegend } from '@/components/ui/StatusLegend';
import { KpiCard } from '@/components/ui/KpiCard';
import { CierreManualModal } from '@/components/qr/CierreManualModal';
import { FilterInput, FilterSelect } from '@/components/filters/FilterControls';
import { ExportMenu } from '@/components/export/ExportMenu';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { listRecuperacionesByProduction, cerrarReoperacionManual } from '@/services/operationService';
import { fetchReoperacionesWithPlaca, type ReoperationWithPlaca } from '@/services/metricsService';
import { useProductions } from '@/hooks/useProductions';
import { exportExcel, exportPdf, type ExportColumn } from '@/lib/exportFiles';
import { isWithinDateRange } from '@/lib/dateKey';
import {
  canRegisterOperations,
  productionDisplayLabel,
  REOPERATION_PROCESSES,
  type IncidentStatus,
  type Reoperation,
} from '@/types/domain';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

interface ReoperationRow {
  id: string;
  fechaIso: string;
  fecha: string;
  serie: string;
  posicion: string;
  servicio: string;
  caja: string;
  proceso: string;
  operador: string;
  estado: IncidentStatus;
  placaId: string | null;
  reoperacion: Reoperation;
}

interface Filters {
  serie: string;
  caja: string;
  servicio: string;
  proceso: string;
  estado: string;
  operador: string;
  fechaInicial: string;
  fechaFinal: string;
}

const EMPTY_FILTERS: Filters = {
  serie: '',
  caja: '',
  servicio: '',
  proceso: '',
  estado: '',
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

const ESTADO_TEXT: Record<string, string> = { pendiente: 'Pendiente', completo: 'Recuperada' };

const EXPORT_COLUMNS: ExportColumn<ReoperationRow>[] = [
  { header: 'Serie', value: (r) => r.serie },
  { header: 'Posición', value: (r) => r.posicion },
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Caja', value: (r) => r.caja },
  { header: 'Proceso', value: (r) => r.proceso },
  { header: 'Fecha y hora', value: (r) => r.fecha },
  { header: 'Operador', value: (r) => r.operador },
  { header: 'Estado', value: (r) => ESTADO_TEXT[r.estado] ?? r.estado },
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v && v !== '—'))).sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true }),
  );
}

export function ReoperationsPage({ onNavigate }: ScreenProps) {
  const { profile, session } = useAuth();
  const { operatorName, selectedProductionId } = useProductionSelection();
  const { productions } = useProductions();
  const [reoperaciones, setReoperaciones] = useState<ReoperationWithPlaca[]>([]);
  const [recuperaciones, setRecuperaciones] = useState<Awaited<ReturnType<typeof listRecuperacionesByProduction>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!selectedProductionId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextReoperations, nextRecuperaciones] = await Promise.all([fetchReoperacionesWithPlaca(selectedProductionId), listRecuperacionesByProduction(selectedProductionId)]);
      setReoperaciones(nextReoperations);
      setRecuperaciones(nextRecuperaciones);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las reoperaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [selectedProductionId]);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [cierreTarget, setCierreTarget] = useState<ReoperationRow | null>(null);
  const [closing, setClosing] = useState(false);

  const selected = productions.find((item) => item.id === selectedProductionId) ?? null;
  const displayName = operatorName ?? profile?.full_name ?? profile?.email ?? '—';

  const allRows: ReoperationRow[] = useMemo(() => {
    return reoperaciones.map((r) => {
      return {
        id: r.id,
        fechaIso: r.fecha_hora,
        fecha: DATE_FORMATTER.format(new Date(r.fecha_hora)),
        serie: r.serie,
        posicion: r.posicion,
        servicio: r.servicio,
        caja: r.numero_caja,
        proceso: r.proceso || '—',
        operador: r.operador || '—',
        estado: (r.estado as IncidentStatus) ?? 'pendiente',
        placaId: r.placa_id,
        reoperacion: r as Reoperation,
      };
    });
  }, [reoperaciones]);

  const options = useMemo(
    () => ({
      cajas: uniqueSorted(allRows.map((r) => r.caja)),
      servicios: uniqueSorted(allRows.map((r) => r.servicio)),
      operadores: uniqueSorted(allRows.map((r) => r.operador)),
    }),
    [allRows],
  );

  const filteredRows = useMemo(() => {
    const serie = filters.serie.trim().toLowerCase();
    return allRows
      .filter((r) => !serie || r.serie.toLowerCase().includes(serie))
      .filter((r) => !filters.caja || r.caja === filters.caja)
      .filter((r) => !filters.servicio || r.servicio === filters.servicio)
      .filter((r) => !filters.proceso || r.proceso === filters.proceso)
      .filter((r) => !filters.estado || r.estado === filters.estado)
      .filter((r) => !filters.operador || r.operador === filters.operador)
      .filter((r) => isWithinDateRange(r.fechaIso, filters.fechaInicial, filters.fechaFinal));
  }, [allRows, filters]);

  const totalReoperaciones = allRows.length;
  const totalPlacasReoperadas = new Set(allRows.filter((r) => r.placaId).map((r) => r.placaId)).size;
  const totalPendientes = allRows.filter((r) => r.estado === 'pendiente').length;
  const totalRecuperaciones = recuperaciones.length;
  const totalPlacasRecuperadas = new Set(recuperaciones.filter((r) => r.placa_id).map((r) => r.placa_id)).size;

  const canOperate = profile ? canRegisterOperations(profile.role) : false;
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const handleCierreConfirm = async (motivo: string, tipoRecuperacion: string) => {
    if (!cierreTarget || !selectedProductionId) return;
    setClosing(true);
    try {
      await cerrarReoperacionManual({
        reoperacionId: cierreTarget.id,
        produccion_id: selectedProductionId,
        placa_id: cierreTarget.placaId,
        operador: displayName,
        usuario: session?.user.email ?? '',
        motivo,
        tipo_recuperacion: tipoRecuperacion,
      });
      setCierreTarget(null);
      await reload();
    } finally {
      setClosing(false);
    }
  };

  const exportMeta = () => ({
    title: 'Reoperaciones generales',
    fileBase: 'reoperaciones-generales',
    produccion: selected ? productionDisplayLabel(selected) : '—',
    usuario: displayName,
    filtros: describeFilters(filters),
    kpis: [
      { label: 'Total reoperaciones', value: filteredRows.length },
      { label: 'Pendientes', value: filteredRows.filter((r) => r.estado === 'pendiente').length },
    ],
  });

  const columns: DataTableColumn<ReoperationRow>[] = [
    { header: 'Serie', cell: (row) => <span className="font-mono">{row.serie}</span> },
    { header: 'Posición', cell: (row) => row.posicion },
    { header: 'Servicio', cell: (row) => row.servicio },
    { header: 'Caja', cell: (row) => <span className="font-mono">{row.caja}</span> },
    { header: 'Proceso', cell: (row) => row.proceso },
    { header: 'Fecha y hora', cell: (row) => row.fecha },
    { header: 'Operador', cell: (row) => row.operador },
    { header: 'Estado', cell: (row) => <StatusBadge status={row.estado} /> },
    ...(canOperate
      ? [{
          header: 'Acción',
          cell: (row: ReoperationRow) =>
            row.estado === 'pendiente' ? (
              <button
                type="button"
                onClick={() => setCierreTarget(row)}
                disabled={closing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-success disabled:opacity-50"
              >
                <ShieldCheck className="h-3 w-3" />
                Marcar como recuperada
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            ),
        }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Registro"
        title="Reoperaciones generales"
        description={
          selected
            ? `Reoperaciones de la producción ${productionDisplayLabel(selected)}.`
            : 'Listado de reoperaciones de la producción seleccionada.'
        }
        actions={
          <ExportMenu
            disabled={filteredRows.length === 0}
            onExcel={() => exportExcel(exportMeta(), EXPORT_COLUMNS, filteredRows)}
            onPdf={() => exportPdf(exportMeta(), EXPORT_COLUMNS, filteredRows)}
          />
        }
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard icon={RotateCcw} label="Total reoperaciones" value={totalReoperaciones} tone="amber" />
        <KpiCard icon={Package} label="Placas reoperadas" value={totalPlacasReoperadas} tone="navy" />
        <KpiCard icon={AlertCircle} label="Pendientes" value={totalPendientes} tone="red" />
        <KpiCard icon={ShieldCheck} label="Recuperaciones" value={totalRecuperaciones} tone="emerald" />
        <KpiCard icon={CheckCircle2} label="Placas recuperadas" value={totalPlacasRecuperadas} tone="emerald" />
      </div>

      <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
        <StatusLegend />
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        <FilterInput label="Serie" value={filters.serie} placeholder="Buscar serie" onChange={(v) => setFilters({ ...filters, serie: v })} />
        <FilterSelect
          label="Caja"
          value={filters.caja}
          onChange={(v) => setFilters({ ...filters, caja: v })}
          options={[{ value: '', label: 'Todas las cajas' }, ...options.cajas.map((c) => ({ value: c, label: c }))]}
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
          label="Estado"
          value={filters.estado}
          onChange={(v) => setFilters({ ...filters, estado: v })}
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'pendiente', label: 'Pendiente' },
            { value: 'completo', label: 'Recuperada' },
          ]}
        />
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
          Mostrando {filteredRows.length} de {allRows.length} reoperaciones
        </span>
        {filtersActive && (
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="font-medium text-accent hover:underline">
            Limpiar filtros
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          Cargando reoperaciones...
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <DataTable
          columns={columns}
          rows={filteredRows}
          getRowKey={(row) => row.id}
          emptyTitle="No hay reoperaciones con estos filtros"
          emptyDescription={
            selected
              ? 'Cuando se registren reoperaciones de esta producción aparecerán en esta tabla.'
              : 'Selecciona una producción para ver sus reoperaciones.'
          }
        />
      )}

      {cierreTarget && (
        <CierreManualModal
          reoperacion={cierreTarget.reoperacion}
          placa={null}
          onClose={() => setCierreTarget(null)}
          onConfirm={handleCierreConfirm}
        />
      )}
    </div>
  );
}

function describeFilters(filters: Filters): string[] {
  const parts: string[] = [];
  if (filters.serie) parts.push(`Serie contiene "${filters.serie}"`);
  if (filters.caja) parts.push(`Caja ${filters.caja}`);
  if (filters.servicio) parts.push(`Servicio ${filters.servicio}`);
  if (filters.proceso) parts.push(`Proceso ${filters.proceso}`);
  if (filters.estado) parts.push(`Estado ${ESTADO_TEXT[filters.estado] ?? filters.estado}`);
  if (filters.operador) parts.push(`Operador ${filters.operador}`);
  if (filters.fechaInicial) parts.push(`Desde ${filters.fechaInicial}`);
  if (filters.fechaFinal) parts.push(`Hasta ${filters.fechaFinal}`);
  return parts;
}
