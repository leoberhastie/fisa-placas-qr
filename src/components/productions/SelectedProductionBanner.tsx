import { AlertCircle, ArrowRight, Factory } from 'lucide-react';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import { productionDisplayLabel } from '@/types/domain';

interface SelectedProductionBannerProps {
  onNavigate: (path: string) => void;
}

export function SelectedProductionBanner({ onNavigate }: SelectedProductionBannerProps) {
  const { selectedProductionId } = useProductionSelection();
  const { productions, loading, error } = useProductions();

  if (loading) {
    return <div className="h-16 animate-pulse rounded-2xl bg-muted" />;
  }

  if (error) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        No se pudo verificar la producción seleccionada. {error}
      </div>
    );
  }

  const selected = productions.find((item) => item.id === selectedProductionId) ?? null;

  if (!selected) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-warning">Selecciona una producción para trabajar con sus registros.</p>
        <button
          type="button"
          onClick={() => onNavigate('/produccion')}
          className="flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary sm:self-auto"
        >
          Ir a producciones
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Factory className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Producción activa</p>
        <p className="truncate font-semibold text-primary">
          <span className="font-mono">{productionDisplayLabel(selected)}</span> · {selected.name}
        </p>
      </div>
    </div>
  );
}
