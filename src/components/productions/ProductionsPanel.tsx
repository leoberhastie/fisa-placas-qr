import { useState } from 'react';
import { AlertCircle, Factory, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { ProductionCard } from '@/components/productions/ProductionCard';
import { ProductionFormModal } from '@/components/productions/ProductionFormModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import { canManageProductions, productionDisplayLabel, type Production, type ProductionStatus } from '@/types/domain';
import type { ProductionInput, ProductionUpdateInput } from '@/services/productionService';

export function ProductionsPanel() {
  const { profile } = useAuth();
  const { selectedProductionId, selectProduction } = useProductionSelection();
  const { productions, loading, error, reload, addProduction, editProduction, changeStatus } = useProductions();
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduction, setEditingProduction] = useState<Production | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const role = profile?.role ?? 'operador';
  const canManage = canManageProductions(role);
  const selected = productions.find((item) => item.id === selectedProductionId) ?? null;

  const handleStatusChange = async (id: string, status: ProductionStatus) => {
    setActionError(null);
    setBusyId(id);
    try {
      await changeStatus(id, status);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo actualizar la producción.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (input: ProductionInput) => {
    if (editingProduction) {
      const update: ProductionUpdateInput = {
        name: input.name,
        description: input.description,
        consecutivo: input.consecutivo,
        estado: input.estado,
        anio: input.anio,
      };
      await editProduction(editingProduction.id, update);
    } else {
      const created = await addProduction(input);
      selectProduction(created.id);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Selección de producción"
        title="Producciones"
        description="Elige la producción con la que vas a trabajar. Todo registro se asociará a ella."
        actions={
          <>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              aria-label="Actualizar lista"
              className="flex items-center justify-center rounded-lg border border-border bg-card p-2.5 text-muted-foreground transition hover:bg-muted/50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setEditingProduction(null);
                  setFormOpen(true);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary active:scale-[0.98] sm:flex-none"
              >
                <Plus className="h-4 w-4" />
                Nueva producción
              </button>
            )}
          </>
        }
      />

      {selected ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary-foreground">
              <Factory className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-accent">Producción activa</p>
              <p className="truncate font-semibold text-foreground">
                <span className="font-mono">{productionDisplayLabel(selected)}</span> · {selected.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => selectProduction(null)}
            className="flex items-center justify-center gap-1.5 self-start rounded-lg px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/15 sm:self-auto"
          >
            <X className="h-4 w-4" />
            Quitar selección
          </button>
        </div>
      ) : (
        !loading &&
        !error && (
          <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Aún no has seleccionado una producción.
          </div>
        )
      )}

      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          Cargando producciones...
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-card px-6 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">No pudimos cargar las producciones</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && productions.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Factory className="h-6 w-6" />
          </div>
          <p className="font-semibold text-foreground">Todavía no hay producciones</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {canManage
              ? 'Crea la primera producción para empezar a registrar reoperaciones.'
              : 'Un administrador debe crear una producción antes de poder trabajar.'}
          </p>
        </div>
      )}

      {!loading && !error && productions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {productions.map((production) => (
            <ProductionCard
              key={production.id}
              production={production}
              isSelected={production.id === selectedProductionId}
              canManage={canManage}
              busy={busyId === production.id}
              onSelect={() => selectProduction(production.id)}
              onChangeStatus={(status) => void handleStatusChange(production.id, status)}
              onEdit={() => {
                setEditingProduction(production);
                setFormOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <ProductionFormModal
          onClose={() => {
            setFormOpen(false);
            setEditingProduction(null);
          }}
          onSave={handleSave}
          editingProduction={editingProduction}
        />
      )}
    </section>
  );
}
