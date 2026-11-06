import { useState, type FormEvent } from 'react';
import { AlertCircle, Factory, Loader2, User } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import { productionDisplayLabel, ROLE_LABELS, type Production } from '@/types/domain';

interface PostLoginSetupModalProps {
  userName: string;
  role: string;
  onClose: () => void;
}

export function PostLoginSetupModal({ userName, role, onClose }: PostLoginSetupModalProps) {
  const { productions, loading, error } = useProductions();
  const { selectProduction, setOperatorName } = useProductionSelection();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [operatorNameInput, setOperatorNameInput] = useState(userName);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const availableProductions = productions.filter((p) => p.status !== 'archivada');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedId) {
      setFormError('Selecciona una producción para continuar.');
      return;
    }
    if (!operatorNameInput.trim()) {
      setFormError('Escribe el nombre del operador o gerente.');
      return;
    }

    setSubmitting(true);
    try {
      selectProduction(selectedId);
      setOperatorName(operatorNameInput.trim());
      onClose();
    } catch {
      setFormError('No se pudo guardar la selección. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Configurar sesión de trabajo" onClose={onClose} closeDisabled={submitting}>
      <form onSubmit={handleSubmit} noValidate className="space-y-6 px-6 py-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Antes de empezar, selecciona la producción en la que vas a trabajar e indica tu nombre.
          Todos los registros se asociarán a esta producción.
        </p>

        {/* Operator name */}
        <div className="space-y-2">
          <label htmlFor="operator-name" className="block text-sm font-medium text-foreground/80">
            Nombre del {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? 'usuario'}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="operator-name"
              type="text"
              value={operatorNameInput}
              onChange={(e) => setOperatorNameInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground placeholder-muted-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="Tu nombre"
            />
          </div>
        </div>

        {/* Production selection */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground/80">Producción</label>

          {loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Cargando producciones...
            </div>
          )}

          {!loading && error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && availableProductions.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              No hay producciones disponibles. Contacta al administrador.
            </div>
          )}

          {!loading && !error && availableProductions.length > 0 && (
            <div className="space-y-2">
              {availableProductions.map((p) => (
                <ProductionRadioCard
                  key={p.id}
                  production={p}
                  selected={selectedId === p.id}
                  onSelect={() => setSelectedId(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {formError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !selectedId || !operatorNameInput.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Guardando...' : 'Confirmar y continuar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProductionRadioCard({
  production,
  selected,
  onSelect,
}: {
  production: Production;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = productionDisplayLabel(production);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
          : 'border-border bg-card hover:border-border hover:bg-muted/50'
      }`}
    >
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          selected ? 'border-accent bg-accent' : 'border-border'
        }`}
      >
        {selected && <div className="h-2 w-2 rounded-full bg-card" />}
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary/80">
        <Factory className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{production.description}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
          production.status === 'activa'
            ? 'bg-success/10 text-success'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {production.status === 'activa' ? 'Activa' : 'Finalizada'}
      </span>
    </button>
  );
}
