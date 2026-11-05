import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  Check,
  Layers,
  ListChecks,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  REOPERATION_PROCESSES,
  placaLabel,
  type Placa,
  type ReoperationProcess,
} from '@/types/domain';
import {
  createReoperacionesBatch,
  insertHistorialBatch,
  listPlacasByBox,
  listServiceBoxes,
  type ReoperationInput,
  type HistorialInput,
  type ServiceBox,
} from '@/services/operationService';
import { listServiceSummaries, type ServiceSummary } from '@/services/serviceBoxImportService';

const PERSIST_KEY = 'reoperaciones.batchSelection';

interface BatchPersist {
  servicio: string;
  numeroCaja: string;
}

function loadPersist(): BatchPersist | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as BatchPersist) : null;
  } catch {
    return null;
  }
}

function savePersist(data: BatchPersist): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

type SelectionMode = 'rango' | 'manual';

interface BatchReoperationPanelProps {
  produccionId: string;
  operador: string;
  usuario: string;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

export function BatchReoperationPanel({
  produccionId,
  operador,
  usuario,
  open,
  onClose,
  onCompleted,
}: BatchReoperationPanelProps) {
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicio, setServicio] = useState('');
  const [boxes, setBoxes] = useState<ServiceBox[]>([]);
  const [boxesLoading, setBoxesLoading] = useState(false);
  const [numeroCaja, setNumeroCaja] = useState('');
  const [placas, setPlacas] = useState<Placa[]>([]);
  const [placasLoading, setPlacasLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('rango');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [proceso, setProceso] = useState<ReoperationProcess>(REOPERATION_PROCESSES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load services on open + restore persisted service/caja
  useEffect(() => {
    if (!open || !produccionId) return;
    setServicesLoading(true);
    setError(null);
    listServiceSummaries(produccionId)
      .then((data) => {
        setServices(data);
        const persisted = loadPersist();
        if (persisted?.servicio && data.some((s) => s.servicio === persisted.servicio)) {
          setServicio(persisted.servicio);
          if (persisted.numeroCaja) setNumeroCaja(persisted.numeroCaja);
        }
      })
      .catch(() => setError('No se pudieron cargar los servicios.'))
      .finally(() => setServicesLoading(false));
  }, [open, produccionId]);

  // Load boxes when service changes
  useEffect(() => {
    if (!open || !servicio || !produccionId) return;
    setBoxesLoading(true);
    setBoxes([]);
    setNumeroCaja((current) => {
      // keep persisted caja if it might belong to this service; validate after load
      return current;
    });
    listServiceBoxes(produccionId, servicio)
      .then((data) => {
        setBoxes(data);
        setNumeroCaja((current) => {
          if (current && data.some((b) => b.numero_caja === current)) return current;
          return '';
        });
      })
      .catch(() => setError('No se pudieron cargar las cajas del servicio.'))
      .finally(() => setBoxesLoading(false));
  }, [open, produccionId, servicio]);

  // Load placas when box is selected
  useEffect(() => {
    if (!open || !servicio || !numeroCaja || !produccionId) {
      setPlacas([]);
      setSelectedIds(new Set());
      setRangeStart('');
      setRangeEnd('');
      return;
    }
    setPlacasLoading(true);
    setError(null);
    listPlacasByBox(produccionId, servicio, numeroCaja)
      .then((data) => {
        setPlacas(data);
        setSelectedIds(new Set());
        setRangeStart('');
        setRangeEnd('');
      })
      .catch(() => setError('No se pudieron cargar las placas de la caja.'))
      .finally(() => setPlacasLoading(false));
    savePersist({ servicio, numeroCaja });
  }, [open, produccionId, servicio, numeroCaja]);

  const serviceOptions = useMemo(
    () => services.map((s) => ({ value: s.servicio, label: `${s.servicio} (${s.placas} placas)` })),
    [services],
  );
  const boxOptions = useMemo(
    () => boxes.map((b) => ({ value: b.numero_caja, label: `Caja ${b.numero_caja} (${b.placas} placas)` })),
    [boxes],
  );
  const placaOptions = useMemo(
    () => placas.map((p) => ({ value: p.id, label: placaLabel(p) })),
    [placas],
  );

  // Compute selected placas based on mode
  const selectedPlacas = useMemo<Placa[]>(() => {
    if (selectionMode === 'manual') {
      return placas.filter((p) => selectedIds.has(p.id));
    }
    // rango
    const startIdx = placas.findIndex((p) => p.id === rangeStart);
    const endIdx = placas.findIndex((p) => p.id === rangeEnd);
    if (startIdx === -1 || endIdx === -1) return [];
    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);
    return placas.slice(from, to + 1);
  }, [selectionMode, placas, selectedIds, rangeStart, rangeEnd]);

  const selectedCount = selectedPlacas.length;

  const toggleManual = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedIds(new Set());
    setRangeStart('');
    setRangeEnd('');
  }, []);

  const handleOpenProcess = () => {
    if (selectedCount === 0) return;
    setShowProcessModal(true);
  };

  const handleConfirmBatch = async () => {
    if (selectedCount === 0 || !produccionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const reopInputs: ReoperationInput[] = selectedPlacas.map((p) => ({
        produccion_id: produccionId,
        placa_id: p.id,
        proceso,
        operador,
        usuario,
        estado: 'pendiente',
        observaciones: '',
      }));
      const histInputs: HistorialInput[] = selectedPlacas.map((p) => ({
        produccion_id: produccionId,
        placa_id: p.id,
        tipo_operacion: 'reoperacion',
        proceso,
        operador,
        usuario,
        estado_anterior: '',
        estado_nuevo: 'pendiente',
        observaciones: '',
      }));
      await createReoperacionesBatch(reopInputs);
      await insertHistorialBatch(histInputs);
      setShowProcessModal(false);
      resetSelection();
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setShowProcessModal(false);
    resetSelection();
    setError(null);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <Modal
        title="Reoperación por lote"
        onClose={handleClose}
        closeDisabled={submitting}
        size="lg"
      >
        <div className="space-y-5 px-5 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Servicio */}
          <div className="space-y-2">
            <StepLabel num={1} icon={<Layers className="h-4 w-4" />} text="Servicio" />
            {servicesLoading ? (
              <LoadingPill text="Cargando servicios..." />
            ) : (
              <SearchableSelect
                label="Selecciona un servicio"
                value={servicio}
                options={serviceOptions}
                onChange={(v) => {
                  setServicio(v);
                  setNumeroCaja('');
                }}
              />
            )}
          </div>

          {/* Step 2: Caja */}
          {servicio && (
            <div className="space-y-2">
              <StepLabel num={2} icon={<Boxes className="h-4 w-4" />} text="Caja" />
              {boxesLoading ? (
                <LoadingPill text="Cargando cajas..." />
              ) : boxOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cajas en este servicio.</p>
              ) : (
                <SearchableSelect
                  label="Selecciona una caja"
                  value={numeroCaja}
                  options={boxOptions}
                  onChange={setNumeroCaja}
                />
              )}
            </div>
          )}

          {/* Step 3: Selección de placas */}
          {numeroCaja && (
            <div className="space-y-3">
              <StepLabel num={3} icon={<ListChecks className="h-4 w-4" />} text="Selecciona placas" />
              {placasLoading ? (
                <LoadingPill text="Cargando placas..." />
              ) : placas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta caja no tiene placas.</p>
              ) : (
                <>
                  {/* Mode toggle */}
                  <div className="flex gap-2 rounded-lg border border-border bg-card p-1">
                    <ModeButton
                      active={selectionMode === 'rango'}
                      onClick={() => { setSelectionMode('rango'); resetSelection(); }}
                      label="Por rango"
                    />
                    <ModeButton
                      active={selectionMode === 'manual'}
                      onClick={() => { setSelectionMode('manual'); resetSelection(); }}
                      label="Manual"
                    />
                  </div>

                  {selectionMode === 'rango' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SearchableSelect
                        label="Placa inicial"
                        value={rangeStart}
                        options={placaOptions}
                        onChange={setRangeStart}
                      />
                      <SearchableSelect
                        label="Placa final"
                        value={rangeEnd}
                        options={placaOptions}
                        onChange={setRangeEnd}
                      />
                      {rangeStart && rangeEnd && (
                        <div className="sm:col-span-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-primary">
                          {selectedCount > 0
                            ? `${selectedCount} placa(s) seleccionada(s) en el rango`
                            : 'Selecciona ambas placas para definir el rango'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {selectedIds.size} seleccionada(s)
                        </p>
                        {selectedIds.size > 0 && (
                          <button
                            type="button"
                            onClick={resetSelection}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Limpiar
                          </button>
                        )}
                      </div>
                      <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                        {placas.map((p) => {
                          const isSelected = selectedIds.has(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => toggleManual(p.id)}
                              className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                                isSelected
                                  ? 'border-warning bg-warning/10 text-warning'
                                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                              }`}
                            >
                              <span className="truncate font-mono text-xs">{placaLabel(p)}</span>
                              {isSelected && <Check className="h-4 w-4 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Footer with counter button */}
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedCount > 0
                ? `${selectedCount} placa(s) lista(s) para reoperación`
                : 'Selecciona al menos una placa'}
            </p>
            <button
              type="button"
              onClick={handleOpenProcess}
              disabled={selectedCount === 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-warning px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-warning disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reoperar{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
        </div>
      </Modal>

      {/* Process selection modal */}
      {showProcessModal && (
        <Modal
          title="Selecciona el proceso"
          onClose={() => !submitting && setShowProcessModal(false)}
          closeDisabled={submitting}
        >
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-muted-foreground">
              Este proceso se aplicará a {selectedCount} placa(s).
            </p>
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
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowProcessModal(false)}
                disabled={submitting}
                className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmBatch}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-warning px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-warning disabled:opacity-70"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {submitting ? 'Registrando...' : 'Confirmar lote'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
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

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {label}
    </button>
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
