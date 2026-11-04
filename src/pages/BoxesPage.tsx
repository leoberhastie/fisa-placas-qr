import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { productionDisplayLabel } from '@/types/domain';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';
import { BoxDetailModal } from '@/components/metrics/BoxDetailModal';
import { BoxStatusActions } from '@/components/metrics/BoxStatusActions';
import { OperationStatusBadge, BOX_STATUS_LABELS, BOX_ESTADO_FILTER_OPTIONS } from '@/components/metrics/OperationStatusBadge';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useAuth } from '@/context/AuthContext';
import { useProductions } from '@/hooks/useProductions';
import { ExportMenu } from '@/components/export/ExportMenu';
import { exportExcel, exportPdf, type ExportMeta } from '@/lib/exportFiles';
import { BOX_EXPORT_COLUMNS } from '@/lib/operationExportColumns';
import { fetchServiceBoxPage, fetchServiceMetrics, type BoxMetricRow } from '@/services/metricsService';
import { PageLoader } from '@/components/ui/PageLoader';
import type { MetricStatus } from '@/lib/metricsTypes';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

type EstadoFilter = 'todos' | MetricStatus;

const PAGE_SIZE = 50;

export function BoxesPage({ onNavigate }: ScreenProps) {
  const { operatorName, selectedProductionId } = useProductionSelection();
  const { profile, session } = useAuth();
  const { productions } = useProductions();

  const [servicios, setServicios] = useState<string[]>([]);
  const [servicioFilter, setServicioFilter] = useState<string>('todos');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('con_reoperaciones');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const [boxes, setBoxes] = useState<BoxMetricRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedBox, setSelectedBox] = useState<BoxMetricRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  useEffect(() => {
    setServicioFilter('todos');
    setSearchInput('');
    setSearchTerm(undefined);
    setPage(1);
    setServicios([]);
    if (!selectedProductionId) return;
    let active = true;
    fetchServiceMetrics(selectedProductionId)
      .then((rows) => {
        if (active) setServicios(rows.map((row) => row.servicio).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
      })
      .catch(() => {
        if (active) setError('No se pudo cargar la lista de servicios.');
      });
    return () => { active = false; };
  }, [selectedProductionId]);

  useEffect(() => {
    if (!selectedProductionId) {
      setBoxes([]);
      setTotalCount(0);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchServiceBoxPage(
      selectedProductionId,
      servicioFilter === 'todos' ? null : servicioFilter,
      estadoFilter,
      page,
      PAGE_SIZE,
      searchTerm,
    )
      .then((result) => {
        if (!active) return;
        setBoxes(result.boxes);
        setTotalCount(result.totalCount);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las cajas.');
        setBoxes([]);
        setTotalCount(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [selectedProductionId, servicioFilter, estadoFilter, page, searchTerm, refreshKey]);

  const serviceOptions = useMemo(
    () => [{ value: 'todos', label: 'Todos los servicios' }, ...servicios.map((s) => ({ value: s, label: s }))],
    [servicios],
  );

  const selectedProduction = productions.find((p) => p.id === selectedProductionId) ?? null;
  const produccionLabel = selectedProduction ? productionDisplayLabel(selectedProduction) : '—';
  const usuario = operatorName ?? profile?.full_name ?? session?.user.email ?? '—';
  const cajasMeta: ExportMeta = {
    title: 'Cajas de la producción',
    fileBase: 'cajas',
    produccion: produccionLabel,
    usuario,
    filtros: [
      ...(servicioFilter === 'todos' ? [] : [`Servicio ${servicioFilter}`]),
      ...(searchTerm ? [`Caja ${searchTerm}`] : []),
      `Estado ${BOX_ESTADO_FILTER_OPTIONS.find((o) => o.value === estadoFilter)?.label ?? ''}`,
      `Página ${page} de ${totalPages}`,
    ],
  };

  function applySearch() {
    const trimmed = searchInput.trim();
    setSearchTerm(trimmed === '' ? undefined : trimmed);
    setPage(1);
  }

  function clearSearch() {
    setSearchInput('');
    setSearchTerm(undefined);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control"
        title="Cajas"
        description="Cajas de la producción con su estado de reoperaciones y completado."
        actions={
          <ExportMenu
            disabled={boxes.length === 0}
            onExcel={() => exportExcel(cajasMeta, BOX_EXPORT_COLUMNS, boxes)}
            onPdf={() => exportPdf(cajasMeta, BOX_EXPORT_COLUMNS, boxes)}
          />
        }
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1.2fr] lg:items-end">
          <SearchableSelect
            label="Servicio"
            value={servicioFilter}
            options={serviceOptions}
            onChange={(value) => {
              setServicioFilter(value);
              setPage(1);
            }}
          />

          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estado
            <select
              value={estadoFilter}
              onChange={(e) => {
                setEstadoFilter(e.target.value as EstadoFilter);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal normal-case text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {BOX_ESTADO_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <label htmlFor="boxes-page-search">Buscar caja</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="boxes-page-search"
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
                  placeholder="Número de caja..."
                  className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-9 text-sm font-normal normal-case text-primary placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={applySearch}
                className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Ir
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {searchTerm
              ? totalCount > 0
                ? `Caja ${searchTerm}: ${totalCount} resultado(s)`
                : `No se encontró la caja ${searchTerm}`
              : totalCount > 0
                ? `Mostrando ${startItem}–${endItem} de ${totalCount} cajas`
                : loading
                  ? 'Cargando cajas...'
                  : 'Sin cajas para este filtro'}
          </p>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Servicio</th>
              <th className="px-4 py-3 font-semibold">Caja</th>
              <th className="px-4 py-3 font-semibold">Piezas</th>
              <th className="px-4 py-3 font-semibold">Serie inicial</th>
              <th className="px-4 py-3 font-semibold">Serie final</th>
              <th className="px-4 py-3 font-semibold">Reoperaciones</th>
              <th className="px-4 py-3 font-semibold">Pendientes</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Cargando datos...</td>
              </tr>
            )}
            {!loading && boxes.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  {!selectedProductionId
                    ? 'Selecciona una producción para ver sus cajas.'
                    : searchTerm
                      ? `No se encontró la caja ${searchTerm}.`
                      : 'Ninguna caja coincide con los filtros seleccionados.'}
                </td>
              </tr>
            )}
            {!loading &&
              boxes.map((box) => (
                <tr
                  key={box.key}
                  onClick={() => setSelectedBox(box)}
                  className="cursor-pointer transition-colors hover:bg-accent/10"
                >
                  <td className="px-4 py-3">{box.servicio}</td>
                  <td className="px-4 py-3 font-mono">{box.caja}</td>
                  <td className="px-4 py-3 tabular-nums">{box.placasCount}</td>
                  <td className="px-4 py-3 font-mono text-xs">{box.serieInicial ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{box.serieFinal ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{box.reoperaciones}</td>
                  <td className="px-4 py-3 tabular-nums">{box.pendientes}</td>
                  <td className="px-4 py-3">
                    <OperationStatusBadge status={box.estado} labels={BOX_STATUS_LABELS} />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <BoxStatusActions
                        box={box}
                        produccionId={selectedProductionId ?? ''}
                        onChanged={() => setRefreshKey((k) => k + 1)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loading && totalCount > 0 && (
        <div className="flex justify-end">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
        </div>
      )}

      {selectedBox && (
        <BoxDetailModal
          box={selectedBox}
          productionId={selectedProductionId ?? ''}
          soloPendientes={selectedBox.estado === 'con_reoperaciones'}
          exportMeta={{
            title: `Detalle de caja ${selectedBox.caja}`,
            fileBase: 'detalle-caja',
            produccion: produccionLabel,
            usuario,
            filtros: [],
          }}
          onClose={() => setSelectedBox(null)}
          onChanged={() => {
            setSelectedBox(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
