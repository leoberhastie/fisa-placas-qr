import { useEffect, useState } from 'react';
import { Loader2, Search, X, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { OperationStatusBadge, BOX_STATUS_LABELS, BOX_ESTADO_FILTER_OPTIONS } from '@/components/metrics/OperationStatusBadge';
import { BoxDetailModal } from '@/components/metrics/BoxDetailModal';
import { BoxStatusActions } from '@/components/metrics/BoxStatusActions';
import { fetchServiceBoxPage, type BoxMetricRow } from '@/services/metricsService';
import type { MetricStatus } from '@/lib/metricsTypes';

const PAGE_SIZE = 50;

type EstadoFilter = 'todos' | MetricStatus;

interface BoxManagementPanelProps {
  open: boolean;
  onClose: () => void;
  servicio: string;
  produccionId: string;
  initialEstado?: EstadoFilter;
  onChanged: () => void;
}

export function BoxManagementPanel({
  open,
  onClose,
  servicio,
  produccionId,
  initialEstado = 'todos',
  onChanged,
}: BoxManagementPanelProps) {
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>(initialEstado);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState<string | undefined>(undefined);
  const [boxes, setBoxes] = useState<BoxMetricRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detailBox, setDetailBox] = useState<BoxMetricRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchServiceBoxPage(produccionId, servicio, estadoFilter, page, PAGE_SIZE, searchTerm)
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
  }, [open, produccionId, servicio, estadoFilter, page, searchTerm, refreshKey]);

  useEffect(() => {
    if (open) {
      setEstadoFilter(initialEstado);
      setPage(1);
      setSearchInput('');
      setSearchTerm(undefined);
    }
  }, [open, initialEstado]);

  function refreshAfterChange() {
    setRefreshKey((key) => key + 1);
    onChanged();
  }

  function handleEstadoChange(value: EstadoFilter) {
    setEstadoFilter(value);
    setPage(1);
  }

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
    <>
      <Modal title={`Cajas — ${servicio}`} onClose={onClose} size="wide">
        <div className="space-y-4 px-6 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <label htmlFor="box-panel-search">Buscar caja</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="box-panel-search"
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

              <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estado
                <select
                  value={estadoFilter}
                  onChange={(e) => handleEstadoChange(e.target.value as EstadoFilter)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal normal-case text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  {BOX_ESTADO_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="self-end lg:self-auto">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
            </div>
          </div>

          {searchTerm && (
            <p className="text-xs text-muted-foreground">
              Buscando caja: <span className="font-semibold text-primary">{searchTerm}</span>
              {' — '}
              {totalCount > 0 ? `${totalCount} resultado(s)` : 'sin resultados'}
            </p>
          )}

          {error && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Cerrar error">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Caja</th>
                  <th className="px-3 py-2 font-semibold">Piezas</th>
                  <th className="px-3 py-2 font-semibold">Serie inicial</th>
                  <th className="px-3 py-2 font-semibold">Serie final</th>
                  <th className="px-3 py-2 font-semibold">Reops</th>
                  <th className="px-3 py-2 font-semibold">Pend</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {!loading && boxes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      {searchTerm
                        ? `No se encontró la caja ${searchTerm}.`
                        : 'Ninguna caja coincide con el filtro seleccionado.'}
                    </td>
                  </tr>
                )}
                {!loading && boxes.map((box) => (
                  <tr key={box.key} className="transition-colors hover:bg-accent/5">
                    <td className="px-3 py-2 font-mono">{box.caja}</td>
                    <td className="px-3 py-2 tabular-nums">{box.placasCount}</td>
                    <td className="px-3 py-2 font-mono text-xs">{box.serieInicial ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{box.serieFinal ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{box.reoperaciones}</td>
                    <td className="px-3 py-2 tabular-nums">{box.pendientes}</td>
                    <td className="px-3 py-2">
                      <OperationStatusBadge status={box.estado} labels={BOX_STATUS_LABELS} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-start justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailBox(box)}
                          title="Ver detalle"
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-muted"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Ver
                        </button>
                        <BoxStatusActions box={box} produccionId={produccionId} onChanged={refreshAfterChange} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && totalCount > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              disabled={loading}
              summary={`Mostrando ${startItem}–${endItem} de ${totalCount} cajas`}
            />
          )}
        </div>
      </Modal>

      {detailBox && (
        <BoxDetailModal
          box={detailBox}
          productionId={produccionId}
          soloPendientes={false}
          exportMeta={{
            title: `Detalle de caja ${detailBox.caja}`,
            fileBase: 'detalle-caja',
            produccion: '',
            usuario: '',
            filtros: [],
          }}
          onClose={() => setDetailBox(null)}
          onChanged={() => {
            setDetailBox(null);
            refreshAfterChange();
          }}
        />
      )}
    </>
  );
}
