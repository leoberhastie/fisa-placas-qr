import { useState, type FormEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { ProductionInput } from '@/services/productionService';
import type { Production } from '@/types/domain';

interface ProductionFormModalProps {
  onClose: () => void;
  onSave: (input: ProductionInput) => Promise<void>;
  editingProduction?: Production | null;
}

const EMPTY_FORM: ProductionInput = {
  code: '',
  name: '',
  description: '',
  consecutivo: 0,
  estado: '',
  anio: new Date().getFullYear(),
};

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

export function ProductionFormModal({ onClose, onSave, editingProduction }: ProductionFormModalProps) {
  const [form, setForm] = useState<ProductionInput>(
    editingProduction
      ? {
          code: editingProduction.code,
          name: editingProduction.name,
          description: editingProduction.description ?? '',
          consecutivo: editingProduction.consecutivo,
          estado: editingProduction.estado,
          anio: editingProduction.anio,
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editingProduction;

  const updateField = <K extends keyof ProductionInput>(field: K, value: ProductionInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.code.trim() || !form.name.trim()) {
      setError('El código y el nombre son obligatorios.');
      return;
    }
    if (!form.estado.trim()) {
      setError('El estado (región) es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la producción.');
    } finally {
      setSaving(false);
    }
  };

  const previewLabel = `${form.consecutivo || 0}-${form.estado || '...'}-${form.anio || '...'}`;

  return (
    <Modal title={isEditing ? 'Editar producción' : 'Nueva producción'} onClose={onClose} closeDisabled={saving}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5 px-6 py-6">
        {/* Preview label */}
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Nombre visible</p>
          <p className="mt-1 font-mono text-lg font-semibold text-primary">{previewLabel}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="production-code" className="block text-sm font-medium text-foreground/80">
              Código
            </label>
            <input
              id="production-code"
              type="text"
              value={form.code}
              onChange={(e) => updateField('code', e.target.value)}
              className={INPUT_CLASS}
              placeholder="PRD-001"
              disabled={isEditing}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="production-name" className="block text-sm font-medium text-foreground/80">
              Nombre interno
            </label>
            <input
              id="production-name"
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={INPUT_CLASS}
              placeholder="Línea de placas frontales"
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="production-consecutivo" className="block text-sm font-medium text-foreground/80">
              Consecutivo
            </label>
            <input
              id="production-consecutivo"
              type="number"
              min={0}
              value={form.consecutivo}
              onChange={(e) => updateField('consecutivo', parseInt(e.target.value) || 0)}
              className={INPUT_CLASS}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="production-estado" className="block text-sm font-medium text-foreground/80">
              Estado (región)
            </label>
            <input
              id="production-estado"
              type="text"
              value={form.estado}
              onChange={(e) => updateField('estado', e.target.value)}
              className={INPUT_CLASS}
              placeholder="Nuevo Leon"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="production-anio" className="block text-sm font-medium text-foreground/80">
              Año
            </label>
            <input
              id="production-anio"
              type="number"
              min={2000}
              max={2100}
              value={form.anio}
              onChange={(e) => updateField('anio', parseInt(e.target.value) || 0)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="production-description" className="block text-sm font-medium text-foreground/80">
            Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="production-description"
            rows={3}
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            className={`${INPUT_CLASS} resize-none`}
            placeholder="Turno, modelo o notas de la producción"
          />
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Guardar producción'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
