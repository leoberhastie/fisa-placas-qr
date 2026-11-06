import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { placaLabel, type Placa } from '@/types/domain';

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
  onToggle: (id: string) => void;
}

export function PlacaSeriesGrid({ placas, selectedIds, onToggle }: PlacaSeriesGridProps) {
  const groups = useMemo(() => groupBySerie(placas), [placas]);

  return (
    <div className="grid max-h-80 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <div key={group.serie} className="rounded-xl border border-border bg-muted/40 p-2.5">
          <p className="mb-2 px-1 font-mono text-xs font-semibold text-primary">{group.serie}</p>
          <div className="grid grid-cols-2 gap-2">
            <PlacaColumn placas={group.frontales} selectedIds={selectedIds} onToggle={onToggle} />
            <PlacaColumn placas={group.traseras} selectedIds={selectedIds} onToggle={onToggle} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PlacaColumn({ placas, selectedIds, onToggle }: PlacaSeriesGridProps) {
  return (
    <div className="flex flex-col gap-2">
      {placas.map((p) => {
        const isSelected = selectedIds.has(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
              isSelected
                ? 'border-warning bg-warning/10 text-warning'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <span className="truncate font-mono">{placaLabel(p)}</span>
            {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
