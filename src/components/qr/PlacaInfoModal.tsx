import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
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
  operadorName: string;
  userEmail: string;
  produccionId: string;
  onClose: () => void;
  onRegisterReoperation: (placaId: string | null, proceso: string, observaciones: string) => Promise<void>;
  onRegisterRecuperacion: (placaId: string | null, tipoRecuperacion: string, observaciones: string) => Promise<void>;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

type ViewMode = 'info' | 'reoperacion_form' | 'reoperacion_confirm' | 'recuperacion_form' | 'recuperacion_confirm' | 'success';

export function PlacaInfoModal({
  info,
  onClose,
  onRegisterReoperation,
  onRegisterRecuperacion,
}: PlacaInfoModalProps) {
  const [mode, setMode] = useState<ViewMode>('info');
  const [proceso, setProceso] = useState<string>(REOPERATION_PROCESSES[0]);
  const [tipoRecuperacion, setTipoRecuperacion] = useState('Recuperación en inspección');
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setMode('info');
    setObservaciones('');
    setError(null);
    setSuccessMsg(null);
    setSubmitting(false);
  }, [info]);

  const handleReoperacion = async () => {
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await onRegisterReoperation(info.placa?.id ?? null, proceso, observaciones);
      setSuccessMsg('Reoperación registrada como PENDIENTE.');
      setMode('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la reoperación.');
      setMode('reoperacion_confirm');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecuperacion = async () => {
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await onRegisterRecuperacion(info.placa?.id ?? null, tipoRecuperacion, observaciones);
      setSuccessMsg('Recuperación registrada correctamente.');
      setMode('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la recuperación.');
      setMode('recuperacion_confirm');
    } finally {
      setSubmitting(false);
    }
  };

  const p = info.placa;

  return (
    <Modal
      title={info.notFound ? 'Placa no encontrada' : 'Información de la placa'}
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

        {successMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Placa info table - shown in info and confirm modes */}
        {p && (mode === 'info' || mode === 'success') && (
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
        )}

        {/* QR complementaria */}
        {!info.notFound && info.parsed.complementaria && (mode === 'info' || mode === 'success') && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Información complementaria del QR</p>
            <p className="mt-1 max-h-24 overflow-y-auto text-xs leading-relaxed text-muted-foreground">
              {info.parsed.complementaria}
            </p>
          </div>
        )}

        {/* Action buttons */}
        {mode === 'info' && !submitting && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setMode('reoperacion_form')}
              disabled={info.notFound}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-warning px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-warning disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reoperación
            </button>
            <button
              type="button"
              onClick={() => setMode('recuperacion_form')}
              disabled={info.notFound || !info.hasPendingReoperation}
              title={!info.hasPendingReoperation ? 'No hay reoperaciones pendientes para esta placa' : undefined}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Recuperar
            </button>
          </div>
        )}

        {/* Reoperation form: select process */}
        {mode === 'reoperacion_form' && p && (
          <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setMode('reoperacion_confirm'); }} className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-primary">Registrar reoperación</h3>
              <p className="mt-1 text-xs text-muted-foreground">Selecciona el proceso de reoperación.</p>
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
            <div className="flex gap-3">
              <button type="button" onClick={() => setMode('info')} className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50">
                Cancelar
              </button>
              <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-warning px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-warning">
                Continuar
              </button>
            </div>
          </form>
        )}

        {/* Reoperation confirmation */}
        {mode === 'reoperacion_confirm' && p && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
                <RotateCcw className="h-6 w-6 text-warning" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-primary">Confirmar reoperación</h3>
              <p className="mt-1 text-sm text-muted-foreground">Verifica los datos antes de registrar.</p>
            </div>
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <InfoRow label="Serie" value={<span className="font-mono">{p.serie}</span>} />
              <InfoRow label="Posición" value={p.posicion} />
              <InfoRow label="Servicio" value={p.servicio} />
              <InfoRow label="Caja" value={p.numero_caja} />
              <InfoRow label="Proceso" value={<span className="font-semibold text-warning">{proceso}</span>} />
            </dl>
            <div className="flex gap-3">
              <button type="button" onClick={() => setMode('reoperacion_form')} disabled={submitting} className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50">
                Volver
              </button>
              <button
                type="button"
                onClick={handleReoperacion}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-warning px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-warning disabled:opacity-70"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {submitting ? 'Registrando...' : 'Confirmar reoperación'}
              </button>
            </div>
          </div>
        )}

        {/* Recuperacion form */}
        {mode === 'recuperacion_form' && p && (
          <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setMode('recuperacion_confirm'); }} className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-primary">Registrar recuperación</h3>
              <p className="mt-1 text-xs text-muted-foreground">Indica el tipo de recuperación.</p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground/80">Tipo de recuperación</label>
              <input
                type="text"
                value={tipoRecuperacion}
                onChange={(e) => setTipoRecuperacion(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Ej: Recuperación en inspección"
              />
            </div>
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
            <div className="flex gap-3">
              <button type="button" onClick={() => setMode('info')} className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50">
                Cancelar
              </button>
              <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-success">
                Continuar
              </button>
            </div>
          </form>
        )}

        {/* Recuperacion confirmation */}
        {mode === 'recuperacion_confirm' && p && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <ShieldCheck className="h-6 w-6 text-success" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-primary">Confirmar recuperación</h3>
              <p className="mt-1 text-sm text-muted-foreground">Verifica los datos antes de registrar.</p>
            </div>
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <InfoRow label="Serie" value={<span className="font-mono">{p.serie}</span>} />
              <InfoRow label="Posición" value={p.posicion} />
              <InfoRow label="Servicio" value={p.servicio} />
              <InfoRow label="Caja" value={p.numero_caja} />
              <InfoRow label="Tipo" value={<span className="font-semibold text-success">{tipoRecuperacion || 'Recuperación'}</span>} />
            </dl>
            <div className="flex gap-3">
              <button type="button" onClick={() => setMode('recuperacion_form')} disabled={submitting} className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50">
                Volver
              </button>
              <button
                type="button"
                onClick={handleRecuperacion}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-success disabled:opacity-70"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {submitting ? 'Registrando...' : 'Confirmar recuperación'}
              </button>
            </div>
          </div>
        )}

        {mode === 'success' && (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary"
          >
            Cerrar
          </button>
        )}
      </div>
    </Modal>
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
