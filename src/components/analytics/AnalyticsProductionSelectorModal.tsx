import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Factory, Loader2, Layers } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { fetchAllProductionOptions, type AnalyticsProductionOption } from '@/services/analyticsService';
import { PRODUCTION_STATUS_LABELS, type ProductionStatus } from '@/types/domain';

interface AnalyticsProductionSelectorModalProps {
  open: boolean;
  initiallySelectedIds: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}

const STATUS_ORDER: ProductionStatus[] = ['activa', 'finalizada', 'archivada'];
const STATUS_BADGE_CLASS: Record<ProductionStatus, string> = {
  activa: 'bg-success/10 text-success',
  finalizada: 'bg-warning/10 text-warning',
  archivada: 'bg-muted text-muted-foreground',
};

export function AnalyticsProductionSelectorModal({
  open,
  initiallySelectedIds,
  onConfirm,
  onClose,
}: AnalyticsProductionSelectorModalProps) {
  const [options, setOptions] = useState<AnalyticsProductionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initiallySelectedIds));
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAllProductionOptions()
      .then((opts) => {
        if (cancelled) return;
        setOptions(opts);
        const initial = new Set(initiallySelectedIds.length > 0 ? initiallySelectedIds : opts.filter((o) => o.status === 'activa').map((o) => o.id));
        setSelectedIds(initial);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las producciones.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    const filtered = filter.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(filter.trim().toLowerCase()))
      : options;
    const map = new Map<ProductionStatus, AnalyticsProductionOption[]>();
    for (const status of STATUS_ORDER) {
      map.set(status, []);
    }
    for (const opt of filtered) {
      const list = map.get(opt.status as ProductionStatus);
      if (list) list.push(opt);
    }
    return map;
  }, [options, filter]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(options.map((o) => o.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const selectActive = () => setSelectedIds(new Set(options.filter((o) => o.status === 'activa').map((o) => o.id)));

  const handleConfirm = () => {
    onConfirm([...selectedIds].sort());
  };

  const selectedCount = selectedIds.size;

  return (
    <Modal title="Seleccionar producciones para análisis" onClose={onClose} size="wide">
      <div className="space-y-5 px-6 py-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Elige qué producciones incluir en el análisis global. Puedes combinar producciones activas, finalizadas y archivadas.
          Por defecto se seleccionan las activas. Tu selección se guardará para la próxima vez.
        </p>

        {/* Search + quick actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar producción..."
              className="w-full rounded-lg border border-border bg-card py-2 px-3 text-sm text-foreground placeholder-muted-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={selectActive} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:bg-muted/50">
              Solo activas
            </button>
            <button type="button" onClick={selectAll} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:bg-muted/50">
              Todas
            </button>
            <button type="button" onClick={deselectAll} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:bg-muted/50">
              Ninguna
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Cargando producciones...
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && (
          <div className="max-h-[50vh] space-y-6 overflow-y-auto rounded-xl border border-border bg-muted/30 p-4">
            {STATUS_ORDER.map((status) => {
              const items = grouped.get(status) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-primary">{PRODUCTION_STATUS_LABELS[status]}</h3>
                    <span className="text-xs text-muted-foreground">({items.length})</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((opt) => (
                      <ProductionCheckboxCard
                        key={opt.id}
                        option={opt}
                        checked={selectedIds.has(opt.id)}
                        onToggle={() => toggle(opt.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {!loading && options.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
                No hay producciones disponibles.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Layers className="h-4 w-4" />
            <span>{selectedCount} {selectedCount === 1 ? 'producción seleccionada' : 'producciones seleccionadas'}</span>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar selección
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ProductionCheckboxCard({
  option,
  checked,
  onToggle,
}: {
  option: AnalyticsProductionOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
        checked
          ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
          : 'border-border bg-card hover:bg-muted/50'
      }`}
    >
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
          checked ? 'border-accent bg-accent text-card' : 'border-border'
        }`}
      >
        {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary/80">
        <Factory className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-4">
        <p className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary">{option.label}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="shrink-0 px-2.5 py-1 text-ms font-medium">{option.description}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[option.status as ProductionStatus] ?? 'bg-muted text-muted-foreground'}`}
      >
        {PRODUCTION_STATUS_LABELS[option.status as ProductionStatus] ?? option.status}
      </span>
    </button>
  );
}
