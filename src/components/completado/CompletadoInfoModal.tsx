import { AlertCircle, CheckCircle2, Clock, Package, RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { MarcarPlacaResult } from '@/services/completadoService';

interface CompletadoInfoModalProps {
  result: MarcarPlacaResult | null;
  placaInfo: { serie: string; posicion: string; servicio: string; numero_caja: string } | null;
  notFound: boolean;
  notFoundSerie: string | null;
  onClose: () => void;
}

export function CompletadoInfoModal({
  result,
  placaInfo,
  notFound,
  notFoundSerie,
  onClose,
}: CompletadoInfoModalProps) {
  const alreadyDone = result?.ya_completada ?? false;

  const title = notFound
    ? 'Placa no encontrada'
    : alreadyDone
      ? 'Placa ya completada'
      : result?.caja_completada_automatico
        ? 'Placa completada — Caja cerrada automáticamente'
        : 'Placa marcada como completada';

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-5 px-6 py-6">
        {notFound && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">No se encontró la placa en la producción activa.</p>
              {notFoundSerie && (
                <p className="mt-1 text-xs">
                  Serie: <span className="font-mono font-semibold">{notFoundSerie}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {!notFound && alreadyDone && (
          <div className="flex items-start gap-3 rounded-lg border-2 border-destructive/50 bg-destructive/15 px-4 py-4 text-destructive">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0" />
            <div className="space-y-1">
              <p className="text-base font-bold">Esta placa ya fue marcada como completada.</p>
              <p className="text-sm">
                Serie: <span className="font-mono font-semibold">{result?.serie}</span>
                {' · '}
                Posición: <span className="font-semibold">{result?.posicion}</span>
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                <span>
                  Registrada el{' '}
                  <span className="font-semibold">
                    {result?.fecha_completado
                      ? new Date(result.fecha_completado).toLocaleString('es-MX')
                      : '—'}
                  </span>
                </span>
              </div>
              <p className="pt-1 text-xs">
                Servicio: {result?.servicio} · Caja: {result?.numero_caja}
              </p>
            </div>
          </div>
        )}

        {!notFound && !alreadyDone && result && (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-4 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
              <div className="space-y-1">
                <p className="text-base font-bold">Placa marcada como completada.</p>
                <p className="text-sm">
                  Serie: <span className="font-mono font-semibold">{result.serie}</span>
                  {' · '}
                  Posición: <span className="font-semibold">{result.posicion}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Servicio: {result.servicio} · Caja: {result.numero_caja}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso de la caja</span>
                <span className="font-semibold text-primary">
                  {result.completadas_caja ?? 0} / {result.total_placas_caja ?? 0}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success transition-all duration-500"
                  style={{
                    width: `${result.total_placas_caja && result.total_placas_caja > 0
                      ? ((result.completadas_caja ?? 0) / result.total_placas_caja) * 100
                      : 0}%`,
                  }}
                />
              </div>
            </div>

            {(result.reoperaciones_cerradas ?? 0) > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                <RotateCcw className="h-5 w-5 shrink-0" />
                <p className="font-medium">
                  Se cerraron {result.reoperaciones_cerradas} reoperacion{result.reoperaciones_cerradas === 1 ? '' : 'es'} pendiente{result.reoperaciones_cerradas === 1 ? '' : 's'} automáticamente.
                </p>
              </div>
            )}

            {result.caja_completada_automatico && (
              <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
                <Package className="h-5 w-5 shrink-0" />
                <p className="font-medium">
                  Caja {result.numero_caja} del servicio {result.servicio} completada automáticamente.
                  Todas las placas fueron escaneadas.
                </p>
              </div>
            )}
          </>
        )}

        {placaInfo && !result && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Confirma el completado de esta placa:</p>
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <Row label="Serie" value={<span className="font-mono">{placaInfo.serie}</span>} />
              <Row label="Posición" value={placaInfo.posicion} />
              <Row label="Servicio" value={placaInfo.servicio} />
              <Row label="Caja" value={placaInfo.numero_caja} />
            </dl>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary"
        >
          Continuar
        </button>
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
