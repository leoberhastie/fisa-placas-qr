import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Layers,
  Loader2,
  Lock,
  PackageCheck,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ServiceCardStep } from '@/components/qr/BatchStepCards';
import { PlacaSeriesGrid } from '@/components/qr/PlacaSeriesGrid';
import {
  fetchBoxMetrics,
  markBoxCompleted,
  reopenBox,
  type BoxMetricRow,
} from '@/services/metricsService';
import {
  createRecuperacionesBatch,
  insertHistorialBatch,
  listPendingPlacasByBox,
  type HistorialInput,
  type RecuperacionInput,
} from '@/services/operationService';
import { listServiceSummaries, type ServiceSummary } from '@/services/serviceBoxImportService';
import type { MetricStatus } from '@/lib/metricsTypes';
import type { Placa } from '@/types/domain';

type PendingAction = { tipo: 'cerrar' | 'reabrir'; box: BoxMetricRow } | null;

type BoxFilter = 'todas' | 'cerradas' | 'bloqueadas' | 'listas';

interface BoxClosePanelProps {
  produccionId: string;
  operador?: string;
  usuario?: string;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

const RECUPERACION_TIPO = 'Recuperación desde cierre de caja';

export function BoxClosePanel({ produccionId, operador = '', usuario = '', open, onClose, onCompleted }: BoxClosePanelProps) {
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicio, setServicio] = useState('');
  const [boxes, setBoxes] = useState<BoxMetricRow[]>([]);
  const [boxesLoading, setBoxesLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boxFilter, setBoxFilter] = useState<BoxFilter>('todas');
  const [recoveryBox, setRecoveryBox] = useState<BoxMetricRow | null>(null);
  const [recoveryPlacas, setRecoveryPlacas] = useState<Placa[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySelected, setRecoverySelected] = useState<Set<string>>(new Set());
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [confirmRecovery, setConfirmRecovery] = useState(false);

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

  const refreshBoxes = useCallback(() => {
    if (!servicio || !produccionId) return Promise.resolve();
    return fetchBoxMetrics(produccionId)
      .then((all) => setBoxes(all.filter((b) => b.servicio === servicio)))
      .catch(() => setError('No se pudieron cargar las cajas del servicio.'));
  }, [produccionId, servicio]);

  useEffect(() => {
    if (!open || !servicio || !produccionId) return;
    setBoxesLoading(true);
    setBoxes([]);
    setError(null);
    refreshBoxes().finally(() => setBoxesLoading(false));
  }, [open, produccionId, servicio, refreshBoxes]);

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

  const filteredBoxes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...boxes].sort((a, b) => {
      const na = parseFloat(a.caja);
      const nb = parseFloat(b.caja);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.caja.localeCompare(b.caja, undefined, { numeric: true });
    });
    const byFilter = sorted.filter((b) => {
      if (boxFilter === 'todas') return true;
      if (boxFilter === 'cerradas') return b.completadaManual;
      if (boxFilter === 'bloqueadas') return !b.completadaManual && b.pendientes > 0;
      if (boxFilter === 'listas') return !b.completadaManual && b.pendientes === 0;
      return true;
    });
    if (!q) return byFilter;
    return byFilter.filter((b) => b.caja.toLowerCase().includes(q));
  }, [boxes, search, boxFilter]);

  const step = !servicio ? 1 : recoveryBox ? 3 : 2;

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
      await refreshBoxes();
      setPending(null);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado de la caja.');
    } finally {
      setBusy(false);
    }
  }, [pending, produccionId, refreshBoxes, onCompleted]);

  const openRecovery = useCallback(async (box: BoxMetricRow) => {
    setRecoveryBox(box);
    setRecoveryError(null);
    setRecoverySelected(new Set());
    setRecoveryLoading(true);
    try {
      const placas = await listPendingPlacasByBox(produccionId, box.servicio, box.caja);
      setRecoveryPlacas(placas);
    } catch {
      setRecoveryError('No se pudieron cargar las placas pendientes de la caja.');
      setRecoveryPlacas([]);
    } finally {
      setRecoveryLoading(false);
    }
  }, [produccionId]);

  const toggleRecoverySelection = useCallback((id: string) => {
    setRecoverySelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllRecovery = useCallback(() => {
    setRecoverySelected(new Set(recoveryPlacas.map((p) => p.id)));
  }, [recoveryPlacas]);

  const clearRecoverySelection = useCallback(() => {
    setRecoverySelected(new Set());
  }, []);

  const recoverySubmitRef = useRef(false);
  const handleConfirmRecovery = useCallback(async () => {
    if (!recoveryBox || recoverySelected.size === 0 || recoverySubmitRef.current) return;
    recoverySubmitRef.current = true;
    setRecoveryBusy(true);
    setRecoveryError(null);
    const selectedPlacas = recoveryPlacas.filter((p) => recoverySelected.has(p.id));
    const selectedIds = new Set(selectedPlacas.map((p) => p.id));
    const recupInputs: RecuperacionInput[] = selectedPlacas.map((p) => ({
      produccion_id: produccionId,
      placa_id: p.id,
      operador,
      usuario,
      tipo_recuperacion: RECUPERACION_TIPO,
      observaciones: '',
    }));
    const histInputs: HistorialInput[] = selectedPlacas.map((p) => ({
      produccion_id: produccionId,
      placa_id: p.id,
      tipo_operacion: 'recuperacion',
      proceso: '',
      operador,
      usuario,
      estado_anterior: 'pendiente',
      estado_nuevo: 'completo',
      observaciones: RECUPERACION_TIPO,
    }));
    let recupDone = false;
    try {
      await createRecuperacionesBatch(recupInputs);
      recupDone = true;
      // Clear selection immediately after recuperaciones are inserted — even if
      // historial fails, the trigger already marked reoperaciones as complete,
      // so these placas must not be recoverable again.
      setRecoverySelected(new Set());
      await insertHistorialBatch(histInputs);
      setConfirmRecovery(false);
      setRecoveryBox(null);
      setRecoveryPlacas([]);
      await refreshBoxes();
      onCompleted();
    } catch (err) {
      if (recupDone) {
        // Recuperaciones were inserted but historial failed — don't let the user
        // retry the same placas; the data is already saved in the database.
        setRecoveryError('Las recuperaciones se registraron pero el historial tuvo un error. Las placas ya fueron recuperadas.');
        setConfirmRecovery(false);
        setRecoveryBox(null);
        setRecoveryPlacas([]);
        void refreshBoxes();
        void onCompleted();
      } else {
        setRecoveryError(err instanceof Error ? err.message : 'No se pudieron recuperar las placas.');
        setConfirmRecovery(false);
      }
    } finally {
      setRecoveryBusy(false);
      recoverySubmitRef.current = false;
    }
  }, [recoveryBox, recoverySelected, recoveryPlacas, produccionId, operador, usuario, refreshBoxes, onCompleted]);

  const handleClose = () => {
    if (busy || recoveryBusy) return;
    setServicio('');
    setBoxes([]);
    setSearch('');
    setError(null);
    setPending(null);
    setBoxFilter('todas');
    setRecoveryBox(null);
    setRecoveryPlacas([]);
    setRecoverySelected(new Set());
    setRecoveryError(null);
    setConfirmRecovery(false);
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
                onClick={() => {
                  if (recoveryBox) {
                    setRecoveryBox(null);
                    setRecoveryPlacas([]);
                    setRecoverySelected(new Set());
                    setRecoveryError(null);
                    return;
                  }
                  setServicio('');
                  setBoxes([]);
                  setBoxFilter('todas');
                }}
                className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary transition hover:bg-primary/20"
              >
                {recoveryBox ? (
                  <span className="flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" /> Volver a cajas
                  </span>
                ) : (
                  servicio
                )}
              </button>
              {recoveryBox && (
                <>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">
                    Caja {recoveryBox.caja} — {recoveryBox.pendientes} pend.
                  </span>
                </>
              )}
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
                  onClick={() => { setServicio(''); setBoxes([]); setBoxFilter('todas'); }}
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Cambiar servicio
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              <SummaryChips
                counts={counts}
                total={boxes.length}
                active={boxFilter}
                onFilter={setBoxFilter}
              />

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
                    <p className="text-sm text-muted-foreground">Ninguna caja coincide con el filtro.</p>
                  ) : (
                    <div className="grid max-h-[58vh] grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5 overflow-y-auto pb-2 pr-1 sm:gap-3">
                      {filteredBoxes.map((box) => (
                        <BoxCloseCard
                          key={`${box.servicio}-${box.caja}`}
                          box={box}
                          disabled={busy}
                          onAction={(tipo) => setPending({ tipo, box })}
                          onRecover={() => void openRecovery(box)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 3 && recoveryBox && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <StepLabel num={3} icon={<RotateCcw className="h-4 w-4" />} text={`Recuperar placas pendientes — Caja ${recoveryBox.caja}`} />
              </div>

              {recoveryError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{recoveryError}</span>
                </div>
              )}

              {recoveryLoading ? (
                <LoadingPill text="Cargando placas pendientes..." />
              ) : recoveryPlacas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta caja no tiene placas pendientes de reoperación.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {recoverySelected.size} de {recoveryPlacas.length} seleccionada(s)
                      </p>
                      <button type="button" onClick={selectAllRecovery} className="text-xs font-medium text-accent hover:underline">
                        Seleccionar todas
                      </button>
                      {recoverySelected.size > 0 && (
                        <button type="button" onClick={clearRecoverySelection} className="text-xs font-medium text-muted-foreground hover:underline">
                          Limpiar
                        </button>
                      )}
                    </div>
                  </div>
                  <PlacaSeriesGrid
                    placas={recoveryPlacas}
                    selectedIds={recoverySelected}
                    pendingIds={new Set(recoveryPlacas.map((p) => p.id))}
                    onToggle={toggleRecoverySelection}
                  />
                  <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {recoverySelected.size > 0
                        ? `${recoverySelected.size} placa(s) seleccionada(s) para recuperar`
                        : 'Selecciona al menos una placa'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setConfirmRecovery(true)}
                      disabled={recoverySelected.size === 0}
                      className="flex items-center justify-center gap-2 rounded-lg bg-success px-6 py-3 text-sm font-semibold text-success-foreground shadow-sm transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Recuperar{recoverySelected.size > 0 ? ` (${recoverySelected.size})` : ''}
                    </button>
                  </div>
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

      {confirmRecovery && recoveryBox && (
        <ConfirmDialog
          title="Confirmar recuperación"
          message={`¿Recuperar ${recoverySelected.size} placa(s) de la caja ${recoveryBox.caja}? Las reoperaciones pendientes anteriores quedarán resueltas.`}
          confirmLabel="Sí, recuperar"
          busy={recoveryBusy}
          onConfirm={handleConfirmRecovery}
          onCancel={() => { if (!recoveryBusy) setConfirmRecovery(false); }}
        />
      )}
    </>
  );
}

function BoxCloseCard({
  box,
  disabled,
  onAction,
  onRecover,
}: {
  box: BoxMetricRow;
  disabled: boolean;
  onAction: (tipo: 'cerrar' | 'reabrir') => void;
  onRecover: () => void;
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
        <button
          type="button"
          disabled={disabled}
          onClick={onRecover}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-destructive px-2 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-destructive active:scale-[0.97] disabled:opacity-50"
        >
          <Lock className="h-3.5 w-3.5" />
          Recuperar ({box.pendientes})
        </button>
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
  active,
  onFilter,
}: {
  counts: { cerradas: number; pendientes: number; listas: number };
  total: number;
  active: BoxFilter;
  onFilter: (f: BoxFilter) => void;
}) {
  const chips: { key: BoxFilter; label: string; value: number; cls: string }[] = [
    { key: 'todas', label: 'cajas', value: total, cls: 'bg-muted text-muted-foreground' },
    { key: 'cerradas', label: 'cerradas', value: counts.cerradas, cls: 'bg-success/10 text-success' },
    { key: 'bloqueadas', label: 'bloqueadas', value: counts.pendientes, cls: 'bg-destructive/10 text-destructive' },
    { key: 'listas', label: 'listas', value: counts.listas, cls: 'bg-primary/10 text-primary' },
  ];
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {chips.map((chip) => {
        const isActive = active === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onFilter(chip.key)}
            className={`rounded-full px-3 py-1 font-semibold transition ${chip.cls} ${
              isActive ? 'ring-2 ring-offset-1 ring-offset-card ring-current' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {chip.value} {chip.label}
            {isActive && <Check className="ml-1 inline h-3 w-3" />}
          </button>
        );
      })}
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
      <Loader2 className="h-4 w-4 animate-spin text-accent" />
      {text}
    </div>
  );
}
