import { Archive, CheckCircle2, Clock, Edit, RotateCcw, Square } from 'lucide-react';
import {
  PRODUCTION_STATUS_LABELS,
  productionDisplayLabel,
  type Production,
  type ProductionStatus,
} from '@/types/domain';

interface ProductionCardProps {
  production: Production;
  isSelected: boolean;
  canManage: boolean;
  busy: boolean;
  onSelect: () => void;
  onChangeStatus: (status: ProductionStatus) => void;
  onEdit: () => void;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

export function ProductionCard({
  production,
  isSelected,
  canManage,
  busy,
  onSelect,
  onChangeStatus,
  onEdit,
}: ProductionCardProps) {
  const isActive = production.status === 'activa';
  const isArchived = production.status === 'archivada';
  const label = productionDisplayLabel(production);

  return (
    <article
      className={`flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md ${
        isSelected ? 'border-accent ring-2 ring-accent/20' : 'border-border'
      } ${isArchived ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs font-semibold tracking-wide text-foreground/80">
          {production.code}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isActive
              ? 'bg-success/10 text-success'
              : isArchived
                ? 'bg-muted text-muted-foreground'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : isArchived ? <Archive className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {PRODUCTION_STATUS_LABELS[production.status]}
        </span>
      </div>

      <h3 className="mt-4 text-lg font-semibold leading-snug text-foreground">{label}</h3>
      {production.description && (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{production.description}</p>
      )}

      <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Creada el {DATE_FORMATTER.format(new Date(production.created_at))}
      </p>

      <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
        <button
          type="button"
          onClick={onSelect}
          disabled={isSelected || isArchived}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            isSelected
              ? 'cursor-default bg-accent/10 text-accent'
              : isArchived
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary active:scale-[0.98]'
          }`}
        >
          {isSelected && <CheckCircle2 className="h-4 w-4" />}
          {isSelected ? 'Producción seleccionada' : 'Seleccionar'}
        </button>

        {canManage && !isArchived && (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50"
          >
            <Edit className="h-4 w-4" />
            Editar
          </button>
        )}

        {canManage && (
          <button
            type="button"
            onClick={() => onChangeStatus(isActive ? 'archivada' : 'activa')}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50"
          >
            {isArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {isArchived ? 'Restaurar' : 'Archivar'}
          </button>
        )}
      </div>
    </article>
  );
}
