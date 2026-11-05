import { useMemo } from 'react';
import {
  AlertCircle,
  Box,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Hash,
  Layers,
  Package,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
  Wrench,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  TIPO_LABELS,
  MODALIDAD_LABELS,
  type HistoryRow,
} from '@/lib/operationHistory';
import type { Placa, Reoperation, Recuperacion } from '@/types/domain';

interface PlacaHistoryModalProps {
  serie: string;
  rows: HistoryRow[];
  placa: Placa | null;
  reoperaciones: Reoperation[];
  recuperaciones: Recuperacion[];
  cajaPlacas: Placa[];
  onClose: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

const FULL_DATE_FORMAT = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function PlacaHistoryModal({
  serie,
  rows,
  placa,
  reoperaciones,
  recuperaciones,
  cajaPlacas,
  onClose,
}: PlacaHistoryModalProps) {
  const timeline = useMemo(
    () => [...rows].sort((a, b) => b.fechaIso.localeCompare(a.fechaIso)),
    [rows],
  );

  const reopsForPlaca = useMemo(
    () => (placa ? reoperaciones.filter((r) => r.placa_id === placa.id) : []),
    [placa, reoperaciones],
  );

  const recupsForPlaca = useMemo(
    () => (placa ? recuperaciones.filter((r) => r.placa_id === placa.id) : []),
    [placa, recuperaciones],
  );

  const pendingCount = reopsForPlaca.filter((r) => r.estado === 'pendiente').length;
  const recoveredCount = reopsForPlaca.filter((r) => r.estado === 'completo').length;

  const cajaRange = useMemo(() => {
    if (cajaPlacas.length === 0) return null;
    const sorted = [...cajaPlacas].sort((a, b) => a.serie.localeCompare(b.serie, 'es', { numeric: true }));
    return { min: sorted[0].serie, max: sorted[sorted.length - 1].serie, total: sorted.length };
  }, [cajaPlacas]);

  return (
    <Modal title={`Historial de la placa ${serie}`} onClose={onClose}>
      <div className="space-y-5 px-6 py-6">
        {/* Placa not found warning */}
        {!placa && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">No se encontró información de la placa en la producción activa.</p>
              <p className="mt-1 text-xs">Serie: <span className="font-mono font-semibold">{serie}</span></p>
            </div>
          </div>
        )}

        {/* Summary cards */}
        {placa && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              icon={RotateCcw}
              label="Reoperaciones"
              value={reopsForPlaca.length}
              tone="amber"
            />
            <SummaryCard
              icon={CheckCircle2}
              label="Recuperadas"
              value={recoveredCount}
              tone="emerald"
            />
            <SummaryCard
              icon={AlertCircle}
              label="Pendientes"
              value={pendingCount}
              tone={pendingCount > 0 ? 'red' : 'slate'}
            />
            <SummaryCard
              icon={ShieldCheck}
              label="Recuperaciones"
              value={recupsForPlaca.length}
              tone="navy"
            />
          </div>
        )}

        {/* Placa info grid */}
        {placa && (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem icon={Search} label="Serie" value={<span className="font-mono font-bold text-primary">{placa.serie}</span>} />
              <InfoItem icon={Layers} label="Posición" value={<span className="font-semibold text-primary">{placa.posicion}</span>} />
              <InfoItem icon={Layers} label="Servicio" value={<span className="font-semibold text-primary">{placa.servicio || '—'}</span>} />
              <InfoItem icon={Box} label="Caja" value={<span className="font-mono font-semibold text-primary">{placa.numero_caja || '—'}</span>} />
              <InfoItem icon={Hash} label="Consecutivo" value={<span className="font-semibold text-primary">{placa.consecutivo}</span>} />
              <InfoItem
                icon={Calendar}
                label="Fecha importación"
                value={<span className="text-sm font-medium text-primary">{placa.fecha_importacion ? DATE_FORMAT.format(new Date(placa.fecha_importacion)) : '—'}</span>}
              />
            </div>
          </div>
        )}

        {/* Caja range info */}
        {placa && cajaRange && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-accent" />
              <h3 className="text-sm font-semibold text-primary">Rango de series de la caja {placa.numero_caja}</h3>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Serie inicial</span>
                <span className="rounded-lg bg-card px-3 py-1 font-mono text-sm font-bold text-primary ring-1 ring-border">{cajaRange.min}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Serie final</span>
                <span className="rounded-lg bg-card px-3 py-1 font-mono text-sm font-bold text-primary ring-1 ring-border">{cajaRange.max}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total placas</span>
                <span className="rounded-lg bg-card px-3 py-1 text-sm font-bold text-primary ring-1 ring-border">{cajaRange.total}</span>
              </div>
            </div>
          </div>
        )}

        {/* Reoperation details: who registered and who confirmed */}
        {placa && reopsForPlaca.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-warning" />
              <h3 className="text-sm font-semibold text-primary">Detalle de reoperaciones</h3>
            </div>
            <div className="space-y-2">
              {reopsForPlaca.map((reop) => {
                const matchingRecup = recupsForPlaca.find(
                  (rc) => rc.fecha_hora >= reop.fecha_hora,
                );
                return (
                  <div key={reop.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                          reop.estado === 'pendiente'
                            ? 'bg-warning/10 text-warning ring-warning/20'
                            : 'bg-success/10 text-success ring-success/20'
                        }`}>
                          {reop.estado === 'pendiente' ? 'Pendiente' : 'Recuperada'}
                        </span>
                        <span className="text-sm font-semibold text-primary">{reop.proceso}</span>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{FULL_DATE_FORMAT.format(new Date(reop.fecha_hora))}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Registrada por</p>
                          <p className="text-sm font-medium text-primary">{reop.operador || reop.usuario || '—'}</p>
                        </div>
                      </div>
                      {matchingRecup && (
                        <div className="flex items-start gap-2">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Confirmada por</p>
                            <p className="text-sm font-medium text-primary">{matchingRecup.operador || matchingRecup.usuario || '—'}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">{FULL_DATE_FORMAT.format(new Date(matchingRecup.fecha_hora))}</p>
                          </div>
                        </div>
                      )}
                      {reop.observaciones && (
                        <div className="flex items-start gap-2 sm:col-span-2">
                          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Observaciones</p>
                            <p className="text-sm text-muted-foreground">{reop.observaciones}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full timeline */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-accent" />
            <h3 className="text-sm font-semibold text-primary">Cronología de movimientos</h3>
          </div>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta placa no tiene movimientos registrados.</p>
          ) : (
            <ol className="space-y-2">
              {timeline.map((row) => (
                <li key={row.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        row.tipo === 'reoperacion'
                          ? 'bg-warning/10 text-warning'
                          : row.tipo === 'recuperacion'
                            ? 'bg-success/10 text-success'
                            : 'bg-muted text-muted-foreground'
                      }`}>
                        {TIPO_LABELS[row.tipo]}
                        {row.tipo === 'recuperacion' && ` · ${MODALIDAD_LABELS[row.modalidad]}`}
                      </span>
                      {row.proceso && <span className="text-xs font-medium text-muted-foreground">{row.proceso}</span>}
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{DATE_FORMAT.format(new Date(row.fechaIso))}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {row.operador || '—'}
                    </span>
                    {row.detalle && <span className="text-muted-foreground">{row.detalle}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
}

type Tone = 'amber' | 'emerald' | 'red' | 'slate' | 'navy';

const TONE_CLASSES: Record<Tone, string> = {
  amber: 'bg-warning/10 text-warning ring-warning/20',
  emerald: 'bg-success/10 text-success ring-success/20',
  red: 'bg-destructive/10 text-destructive ring-destructive/20',
  slate: 'bg-muted text-muted-foreground ring-muted-foreground/20',
  navy: 'bg-primary/10 text-primary ring-primary/20',
};

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof RotateCcw; label: string; value: number; tone: Tone }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-4 text-center">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset ${TONE_CLASSES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-2xl font-bold tabular-nums text-primary">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof Search; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary/70">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm text-primary">{value}</p>
      </div>
    </div>
  );
}
