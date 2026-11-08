import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Layers,
  Lock,
  PackageCheck,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ServiceCardStep } from '@/components/qr/BatchStepCards';
import {
  fetchBoxMetrics,
  markBoxCompleted,
  reopenBox,
  type BoxMetricRow,
} from '@/services/metricsService';
import { listServiceSummaries, type ServiceSummary } from '@/services/serviceBoxImportService';
import type { MetricStatus } from '@/lib/metricsTypes';

type PendingAction = { tipo: 'cerrar' | 'reabrir'; box: BoxMetricRow } | null;

interface BoxClosePanelProps {
  produccionId: string;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

export function BoxClosePanel({ produccionId, open, onClose, onCompleted }: BoxClosePanelProps) {
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicio, setServicio] = useState('');
  const [boxes, setBoxes] = useState<BoxMetricRow[]>([]);
  const [boxesLoading, setBoxesLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !produccionId) return;
    setServicesLoading(true);
    setError(null);
    listServiceSummaries(produccionId)
      .then((data) => {
        setServices(data);
        if (data.length === 1) setServicio(data[0].servicio);
      })
      .catch(() => setError('No se pudieron cargar los servicios.'))
      .finally(() => setServicesLoading(false));
  }, [open, produccionId]);

  useEffect(() => {
    if (!open || !servicio || !produccionId) return;
    setBoxesLoading(true);
    setBoxes([]);
    setError(null);
    fetchBoxMetrics(produccionId)
      .then((all) => setBoxes(all.filter((b) => b.servicio === servicio)))
      .catch(() => setError('No se pudieron cargar las cajas del servicio.'))
      .finally(() => setBoxesLoading(false));
  }, [open, produccionId, servicio]);

  const filteredBoxes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...boxes].sort((a, b) => {
      const na = parseFloat(a.caja);
      const nb = parseFloat(b.caja);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.caja.localeCompare(b.caja, undefined, { numeric: true });
    });
    if (!q) return sorted;
    return sorted.filter((b) => b.caja.toLowerCase().includes(q));
  }, [boxes, search]);

  const counts = useMemo(() => {
    let cerradas = 0;
    let pendientes = 0;
    let listas = 0;
    for (const b of boxes) {
      if (b.completadaManual) cerradas++;
      else if (b.pendientes > 0) pendientes++;
      else listas++;
    }
    return { cerradas, pendientes, listas };
  }, [boxes]);

  const step = !servicio ? 1 : 2;

  const handleConfirm = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.tipo === 'cerrar') {
        await markBoxCompleted(produccionId, pending.box.servicio, pending.box.caja);
      } else {
        await reopenBox(produccionId, pending.box.servicio, pending.box.caja);
      }
      const refreshed = await fetchBoxMetrics(produccionId);
      setBoxes(refreshed.filter((b) => b.servicio === servicio));
      setPending(null);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado de la caja.');
    } finally {
      setBusy(false);
    }
  }, [pending, produccionId, servicio, onCompleted]);

  const handleClose = () => {
    if (busy) return;
    setServicio('');
    setBoxes([]);
    setSearch('');
    setError(null);
    setPending(null);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <Modal title="Cerrar cajas" onClose={handleClose} size="full">
        <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {servicio && (
            <nav className="flex flex-wrap items-center gap-1.5 text-sm">
              <button
                type="button"
                onClick={() => { setServicio(''); setBoxes([]); }}
                className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary transition hover:bg-primary/20"
              >
                {servicio}
              </button>
            </nav>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <StepLabel num={1} icon={<Layers className="h-4 w-4" />} text="Selecciona el servicio" />
              {servicesLoading ? (
                <LoadingPill text="Cargando servicios..." />
              ) : (
                <ServiceCardStep services={services} onSelect={setServicio} />
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <StepLabel num={2} icon={<PackageCheck className="h-4 w-4" />} text="Cajas del servicio" />
                <button
                  type="button"
                  onClick={() => { setServicio(''); setBoxes([]); }}
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Cambiar servicio
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              <SummaryChips counts={counts} total={boxes.length} />

              {boxesLoading ? (
                <LoadingPill text="Cargando cajas..." />
              ) : boxes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este servicio no tiene cajas.</p>
              ) : (
                <>
                  {boxes.length > 8 && (
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar caja"
                        className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />
                    </div>
                  )}
                  {filteredBoxes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ninguna caja coincide con la búsqueda.</p>
                  ) : (
                    <div className="grid max-h-[58vh] grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5 overflow-y-auto pb-2 pr-1 sm:gap-3">
                      {filteredBoxes.map((box) => (
                        <BoxCloseCard
                          key={`${box.servicio}-${box.caja}`}
                          box={box}
                          disabled={busy}
                          onAction={(tipo) => setPending({ tipo, box })}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      {pending && (
        <ConfirmDialog
          title={pending.tipo === 'cerrar' ? 'Cerrar caja' : 'Reabrir caja'}
          message={
            pending.tipo === 'cerrar'
              ? `¿Marcar la caja ${pending.box.caja} como completada?`
              : `¿Reabrir la caja ${pending.box.caja}?`
          }
          confirmLabel={pending.tipo === 'cerrar' ? 'Sí, cerrar' : 'Sí, reabrir'}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => { if (!busy) setPending(null); }}
        />
      )}
    </>
  );
}

function BoxCloseCard({
  box,
  disabled,
  onAction,
}: {
  box: BoxMetricRow;
  disabled: boolean;
  onAction: (tipo: 'cerrar' | 'reabrir') => void;
}) {
  const isClosed = box.completadaManual;
  const hasPending = box.pendientes > 0;
  const canClose = !isClosed && !hasPending;

  const cardClass = isClosed
    ? 'border-success/50 bg-success/10'
    : hasPending
      ? 'border-destructive/30 bg-destructive/5'
      : 'border-border bg-card hover:border-success/50 hover:bg-success/5';

  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 shadow-sm transition ${cardClass}`}>
      <div className="flex items-start justify-between gap-1.5">
        <span className={`text-2xl font-bold leading-none ${isClosed ? 'text-success' : hasPending ? 'text-destructive' : 'text-primary'}`}>
          {box.caja}
        </span>
        <StateBadge estado={box.estado} completadaManual={box.completadaManual} />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-tight text-muted-foreground">
        <span>{box.placasCount} pcs</span>
        {box.reoperaciones > 0 && (
          <span className="text-warning">{box.reoperaciones} reop</span>
        )}
        {hasPending && (
          <span className="font-semibold text-destructive">{box.pendientes} pend</span>
        )}
      </div>

      {isClosed ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction('reabrir')}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-2 text-xs font-semibold text-foreground/80 transition hover:bg-muted active:scale-[0.97] disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reabrir
        </button>
      ) : hasPending ? (
        <div className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-destructive/10 px-2 py-2 text-xs font-semibold text-destructive">
          <Lock className="h-3.5 w-3.5" />
          Bloqueada
        </div>
      ) : canClose ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction('cerrar')}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-success px-2 py-2 text-xs font-semibold text-success-foreground transition hover:bg-success active:scale-[0.97] disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Cerrar
        </button>
      ) : null}
    </div>
  );
}

function StateBadge({ estado, completadaManual }: { estado: MetricStatus; completadaManual: boolean }) {
  if (completadaManual) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">
        <CheckCircle2 className="h-3 w-3" />
        Cerrada
      </span>
    );
  }
  if (estado === 'con_reoperaciones') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
        <AlertCircle className="h-3 w-3" />
        Pend
      </span>
    );
  }
  if (estado === 'completada_ro') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
        <RotateCcw className="h-3 w-3" />
        RO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
      <Inbox className="h-3 w-3" />
      Abierta
    </span>
  );
}

function SummaryChips({
  counts,
  total,
}: {
  counts: { cerradas: number; pendientes: number; listas: number };
  total: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">
        {total} cajas
      </span>
      <span className="rounded-full bg-success/10 px-3 py-1 font-semibold text-success">
        {counts.cerradas} cerradas
      </span>
      <span className="rounded-full bg-destructive/10 px-3 py-1 font-semibold text-destructive">
        {counts.pendientes} bloqueadas
      </span>
      <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
        {counts.listas} listas
      </span>
    </div>
  );
}

function StepLabel({ num, icon, text }: { num: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {num}
      </span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        {icon}
        {text}
      </span>
    </div>
  );
}

function LoadingPill({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <RotateCcw className="h-4 w-4 animate-spin text-accent" />
      {text}
    </div>
  );
}
