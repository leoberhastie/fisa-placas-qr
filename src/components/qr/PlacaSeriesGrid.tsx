import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { Placa } from '@/types/domain';

interface SerieGroup {
  serie: string;
  frontales: Placa[];
  traseras: Placa[];
}

function groupBySerie(placas: Placa[]): SerieGroup[] {
  const groups = new Map<string, SerieGroup>();
  for (const placa of placas) {
    let group = groups.get(placa.serie);
    if (!group) {
      group = { serie: placa.serie, frontales: [], traseras: [] };
      groups.set(placa.serie, group);
    }
    if (placa.posicion === 'FRONTAL') group.frontales.push(placa);
    else group.traseras.push(placa);
  }
  return [...groups.values()];
}

interface PlacaSeriesGridProps {
  placas: Placa[];
  selectedIds: Set<string>;
  pendingIds: Set<string>;
  onToggle: (id: string) => void;
}

export function PlacaSeriesGrid({ placas, selectedIds, pendingIds, onToggle }: PlacaSeriesGridProps) {
  const groups = useMemo(() => groupBySerie(placas), [placas]);

  return (
    <div className="grid max-h-[60vh] grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 overflow-y-auto pr-1">
      {groups.map((group) => (
        <div key={group.serie} className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="mb-2.5 px-1 font-mono text-sm font-semibold text-primary">{group.serie}</p>
          <div className="grid grid-cols-2 gap-2">
            <PlacaColumn placas={group.frontales} selectedIds={selectedIds} pendingIds={pendingIds} onToggle={onToggle} />
            <PlacaColumn placas={group.traseras} selectedIds={selectedIds} pendingIds={pendingIds} onToggle={onToggle} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PlacaColumn({ placas, selectedIds, pendingIds, onToggle }: PlacaSeriesGridProps) {
  return (
    <div className="flex flex-col gap-2">
      {placas.map((p) => {
        const isSelected = selectedIds.has(p.id);
        const isPending = pendingIds.has(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            aria-pressed={isSelected}
            className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              isSelected
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : isPending
                  ? 'border-warning/50 bg-warning/15 text-warning hover:bg-warning/25'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <span>{p.posicion}</span>
            {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
