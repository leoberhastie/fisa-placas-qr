import { useState } from 'react';
import { Search } from 'lucide-react';
import type { ServiceBox } from '@/services/operationService';
import type { ServiceSummary } from '@/services/serviceBoxImportService';

const SERVICE_SEARCH_THRESHOLD = 4;
const BOX_SEARCH_THRESHOLD = 10;

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

interface ServiceCardStepProps {
  services: ServiceSummary[];
  onSelect: (servicio: string) => void;
}

export function ServiceCardStep({ services, onSelect }: ServiceCardStepProps) {
  const [query, setQuery] = useState('');

  if (services.length === 0) return <EmptyText text="No hay servicios en esta producción." />;

  const filtered = services.filter((s) => matchesQuery(s.servicio, query));

  return (
    <div className="space-y-3">
      {services.length > SERVICE_SEARCH_THRESHOLD && (
        <SearchField value={query} onChange={setQuery} placeholder="Buscar servicio" />
      )}
      {filtered.length === 0 ? (
        <EmptyText text="Ningún servicio coincide con la búsqueda." />
      ) : (
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1">
          {filtered.map((s) => (
            <button
              key={s.servicio}
              type="button"
              onClick={() => onSelect(s.servicio)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md active:scale-[0.99]"
            >
              <span className="font-semibold text-primary">{s.servicio}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {s.placas} placas
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface BoxCardStepProps {
  boxes: ServiceBox[];
  onSelect: (numeroCaja: string) => void;
}

export function BoxCardStep({ boxes, onSelect }: BoxCardStepProps) {
  const [query, setQuery] = useState('');

  if (boxes.length === 0) return <EmptyText text="No hay cajas en este servicio." />;

  const filtered = boxes.filter((b) => matchesQuery(b.numero_caja, query));

  return (
    <div className="space-y-3">
      {boxes.length > BOX_SEARCH_THRESHOLD && (
        <SearchField value={query} onChange={setQuery} placeholder="Buscar caja" />
      )}
      {filtered.length === 0 ? (
        <EmptyText text="Ninguna caja coincide con la búsqueda." />
      ) : (
        <div className="grid max-h-[50vh] grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 overflow-y-auto pr-1">
          {filtered.map((b) => {
            const hasReoperations = b.placas_reoperadas > 0;
            return (
              <button
                key={b.numero_caja}
                type="button"
                onClick={() => onSelect(b.numero_caja)}
                className={`flex flex-col items-start gap-1.5 rounded-xl border px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${
                  hasReoperations
                    ? 'border-warning/50 bg-warning/10 hover:border-warning'
                    : 'border-border bg-card hover:border-accent'
                }`}
              >
                <span className={`text-2xl font-bold leading-none ${hasReoperations ? 'text-warning' : 'text-primary'}`}>
                  {b.numero_caja}
                </span>
                <span className="text-xs text-muted-foreground">{b.placas} piezas</span>
                {hasReoperations && (
                  <span className="rounded-full border border-warning/40 bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground">
                    Con reoperación
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
