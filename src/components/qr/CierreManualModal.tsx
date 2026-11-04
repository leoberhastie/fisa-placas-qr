import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Placa, Reoperation } from '@/types/domain';

const MOTIVOS = [
  'Placa recuperada en inspección',
  'No requiere reoperación',
  'Error de clasificación',
  'Reoperación cancelada',
  'Otro motivo',
];

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

interface CierreManualModalProps {
  reoperacion: Reoperation;
  placa: Placa | null;
  onClose: () => void;
  onConfirm: (motivo: string, tipoRecuperacion: string) => Promise<void>;
}

export function CierreManualModal({
  reoperacion,
  placa,
  onClose,
  onConfirm,
}: CierreManualModalProps) {
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [motivoCustom, setMotivoCustom] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const motivoFinal = motivo === 'Otro motivo' ? motivoCustom.trim() || 'Otro motivo' : motivo;
  const tipoRecuperacion = motivoFinal;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(motivoFinal, tipoRecuperacion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cierre.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Marcar como recuperada" onClose={onClose} closeDisabled={submitting}>
      <div className="space-y-5 px-6 py-6">
        <p className="text-sm text-muted-foreground">
          Esta acción registrará una recuperación y cambiará la incidencia a RECUPERADA.
          La reoperación original se conservará en el historial.
        </p>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Placa info */}
        {placa && (
          <dl className="divide-y divide-border rounded-lg border border-border text-sm">
            <Row label="Serie" value={<span className="font-mono">{placa.serie}</span>} />
            <Row label="Posición" value={placa.posicion} />
            <Row label="Servicio" value={placa.servicio} />
            <Row label="Caja" value={placa.numero_caja} />
            <Row label="Proceso" value={reoperacion.proceso || '—'} />
            <Row label="Fecha de reoperación" value={new Date(reoperacion.fecha_hora).toLocaleString('es-MX')} />
          </dl>
        )}

        {/* Motivo selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground/80">Motivo de cierre</label>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT_CLASS} disabled={submitting}>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {motivo === 'Otro motivo' && (
            <input
              type="text"
              value={motivoCustom}
              onChange={(e) => setMotivoCustom(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Escribe el motivo"
              disabled={submitting}
            />
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-success disabled:opacity-70"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {submitting ? 'Registrando...' : 'Confirmar recuperación'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-primary">{value}</dd>
    </div>
  );
}
