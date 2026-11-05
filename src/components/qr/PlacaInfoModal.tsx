import { useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { REOPERATION_PROCESSES, type Placa } from '@/types/domain';
import type { ParsedQrData } from '@/services/qrService';

export interface PlacaInfo {
  placa: Placa | null;
  reopsCount: number;
  recuperacionesCount: number;
  hasPendingReoperation: boolean;
  parsed: ParsedQrData;
  notFound: boolean;
}

interface PlacaInfoModalProps {
  info: PlacaInfo;
  onClose: () => void;
  onRegisterReoperation: (placaId: string | null, proceso: string, observaciones: string) => Promise<void>;
  onRegisterRecuperacion: (placaId: string | null, tipoRecuperacion: string, observaciones: string) => Promise<void>;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

type ViewMode = 'info' | 'reoperacion' | 'recuperacion';

export function PlacaInfoModal({ info, onClose, onRegisterReoperation, onRegisterRecuperacion }: PlacaInfoModalProps) {
  const [mode, setMode] = useState<ViewMode>('info');
  const [proceso, setProceso] = useState<string>(REOPERATION_PROCESSES[0]);
  const [tipoRecuperacion, setTipoRecuperacion] = useState('Recuperación en inspección');
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = info.placa;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'reoperacion') {
        await onRegisterReoperation(p?.id ?? null, proceso, observaciones);
      } else {
        await onRegisterRecuperacion(p?.id ?? null, tipoRecuperacion, observaciones);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la operación.');
      setSubmitting(false);
    }
  };

  const isRecuperacion = mode === 'recuperacion';

  return (
    <Modal
      title={info.notFound ? 'Placa no encontrada' : mode === 'info' ? 'Información de la placa' : isRecuperacion ? 'Registrar recuperación' : 'Registrar reoperación'}
      onClose={onClose}
      closeDisabled={submitting}
    >
      <div className="space-y-5 px-6 py-6">
        {info.notFound && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">No se encontró la placa en la producción activa.</p>
              <p className="mt-1 text-xs">
                Serie: <span className="font-mono font-semibold">{info.parsed.serie}</span>
                {info.parsed.posicionNormalizada && (
                  <> · Posición: <span className="font-semibold">{info.parsed.posicionNormalizada}</span></>
                )}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {p && mode === 'info' && (
          <>
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <InfoRow label="Serie" value={<span className="font-mono">{p.serie}</span>} />
              <InfoRow label="Posición" value={p.posicion} />
              <InfoRow label="Servicio" value={p.servicio} />
              <InfoRow label="Caja" value={p.numero_caja} />
              <InfoRow label="Consecutivo" value={String(p.consecutivo)} />
              <InfoRow label="Estado" value={p.activo ? 'Activa' : 'Inactiva'} />
              <InfoRow label="Reoperaciones anteriores" value={String(info.reopsCount)} />
              <InfoRow label="Recuperaciones anteriores" value={String(info.recuperacionesCount)} />
            </dl>

            {info.parsed.complementaria && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Información complementaria del QR</p>
                <p className="mt-1 max-h-24 overflow-y-auto text-xs leading-relaxed text-muted-foreground">
                  {info.parsed.complementaria}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setMode('reoperacion')}
                disabled={info.notFound}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-warning px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-warning disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reoperación
              </button>
              <button
                type="button"
                onClick={() => setMode('recuperacion')}
                disabled={info.notFound || !info.hasPendingReoperation}
                title={!info.hasPendingReoperation ? 'No hay reoperaciones pendientes para esta placa' : undefined}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                Recuperar
              </button>
            </div>
          </>
        )}

        {p && mode === 'reoperacion' && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-primary">Selecciona el proceso</p>
              <p className="mt-1 text-xs text-muted-foreground">Placa {p.serie} · {p.posicion}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {REOPERATION_PROCESSES.map((proc) => (
                <button
                  key={proc}
                  type="button"
                  onClick={() => setProceso(proc)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                    proceso === proc
                      ? 'border-warning bg-warning/10 text-warning'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {proc}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground/80">Observaciones <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <textarea
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Notas sobre la reoperación"
              />
            </div>
            <FormActions
              submitting={submitting}
              onBack={() => setMode('info')}
              confirmLabel="Confirmar reoperación"
              tone="warning"
              icon={RotateCcw}
            />
          </form>
        )}

        {p && isRecuperacion && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-primary">Tipo de recuperación</p>
              <p className="mt-1 text-xs text-muted-foreground">Placa {p.serie} · {p.posicion}</p>
            </div>
            <input
              type="text"
              value={tipoRecuperacion}
              onChange={(e) => setTipoRecuperacion(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Ej: Recuperación en inspección"
            />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground/80">Observaciones <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <textarea
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Notas sobre la recuperación"
              />
            </div>
            <FormActions
              submitting={submitting}
              onBack={() => setMode('info')}
              confirmLabel="Confirmar recuperación"
              tone="success"
              icon={ShieldCheck}
            />
          </form>
        )}
      </div>
    </Modal>
  );
}

function FormActions({
  submitting,
  onBack,
  confirmLabel,
  tone,
  icon: Icon,
}: {
  submitting: boolean;
  onBack: () => void;
  confirmLabel: string;
  tone: 'warning' | 'success';
  icon: typeof RotateCcw;
}) {
  const toneClass = tone === 'warning' ? 'bg-warning hover:bg-warning' : 'bg-success hover:bg-success';
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50"
      >
        Volver
      </button>
      <button
        type="submit"
        disabled={submitting}
        className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition disabled:opacity-70 ${toneClass}`}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {submitting ? 'Registrando...' : confirmLabel}
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-primary">{value}</dd>
    </div>
  );
}
