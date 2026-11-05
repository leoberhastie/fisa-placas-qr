import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardList,
  Keyboard,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCw,
  ScanLine,
  ShieldCheck,
  User,
  Zap,
  ZapOff,
} from 'lucide-react';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';
import { PlacaInfoModal, type PlacaInfo } from '@/components/qr/PlacaInfoModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusLegend } from '@/components/ui/StatusLegend';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductionData } from '@/hooks/useProductionData';
import { useQrScanner } from '@/hooks/useQrScanner';
import { parseQrContent } from '@/services/qrService';
import { loadQrReaderConfig, playBeep, vibrate, type QrReaderConfig } from '@/lib/qrConfig';
import {
  findPlaca,
  listReoperacionesByPlaca,
  listRecuperacionesByProduction,
  createReoperation,
  createRecuperacion,
  insertHistorial,
  listReoperacionesByProduction,
} from '@/services/operationService';
import { type PlatePosition } from '@/types/domain';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

export function QrReaderPage({ onNavigate }: ScreenProps) {
  const { profile, session } = useAuth();
  const { operatorName, selectedProductionId } = useProductionSelection();
  const { reload } = useProductionData(selectedProductionId);
  const [qrConfig] = useState<QrReaderConfig>(loadQrReaderConfig);

  const [mode, setMode] = useState<'auto' | 'manual'>(qrConfig.scanMode);
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [modalInfo, setModalInfo] = useState<PlacaInfo | null>(null);
  const [modalLock, setModalLock] = useState(false);
  const [lastSerie, setLastSerie] = useState<string | null>(null);
  const [lastPosicion, setLastPosicion] = useState<string | null>(null);
  const [totalReops, setTotalReops] = useState(0);
  const [totalRecuperaciones, setTotalRecuperaciones] = useState(0);
  const [autoProgress, setAutoProgress] = useState<number>(0);
  const [notification, setNotification] = useState<string | null>(null);

  // Manual mode form
  const [manualSerie, setManualSerie] = useState('');
  const [manualPosicion, setManualPosicion] = useState<PlatePosition | ''>('');
  const [manualSearching, setManualSearching] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const displayName = operatorName ?? profile?.full_name ?? profile?.email ?? '—';
  const roleLabel = profile ? (profile.role === 'admin' ? 'Administrador' : profile.role === 'gerente' ? 'Gerente' : 'Operador') : '';

  const loadTotals = useCallback(async () => {
    if (!selectedProductionId) return;
    try {
      const [reops, recups] = await Promise.all([
        listReoperacionesByProduction(selectedProductionId),
        listRecuperacionesByProduction(selectedProductionId),
      ]);
      setTotalReops(reops.length);
      setTotalRecuperaciones(recups.length);
    } catch {
      // ignore
    }
  }, [selectedProductionId]);

  useEffect(() => {
    void loadTotals();
  }, [loadTotals]);

  // Handle QR scan
  const handleScan = useCallback(
    async (decodedText: string) => {
      if (modalLock) return;
      if (!selectedProductionId) return;

      if (qrConfig.soundEnabled) playBeep();
      if (qrConfig.vibrationEnabled) vibrate(80);
      setModalLock(true);

      const parsed = parseQrContent(decodedText);

      if (!parsed.serie || !parsed.posicionNormalizada) {
        setModalInfo({
          placa: null,
          reopsCount: 0,
          recuperacionesCount: 0,
          hasPendingReoperation: false,
          parsed,
          notFound: true,
        });
        setLastSerie(parsed.serie || '—');
        setLastPosicion(parsed.posicionNormalizada ?? parsed.posicion ?? '—');
        return;
      }

      setLastSerie(parsed.serie);
      setLastPosicion(parsed.posicionNormalizada);

      try {
        const placa = await findPlaca(selectedProductionId, parsed.serie, parsed.posicionNormalizada);
        if (!placa) {
          setModalInfo({
            placa: null,
            reopsCount: 0,
            recuperacionesCount: 0,
            hasPendingReoperation: false,
            parsed,
            notFound: true,
          });
        } else {
          const placaReops = await listReoperacionesByPlaca(placa.id);
          const allRecups = await listRecuperacionesByProduction(selectedProductionId);
          const placaRecups = allRecups.filter((r) => r.placa_id === placa.id).length;
          const hasPending = placaReops.some((r) => r.estado === 'pendiente');
          setModalInfo({
            placa,
            reopsCount: placaReops.length,
            recuperacionesCount: placaRecups,
            hasPendingReoperation: hasPending,
            parsed,
            notFound: false,
          });
        }
      } catch {
        setModalInfo({
          placa: null,
          reopsCount: 0,
          recuperacionesCount: 0,
          hasPendingReoperation: false,
          parsed,
          notFound: true,
        });
      }
    },
    [modalLock, selectedProductionId, qrConfig.soundEnabled, qrConfig.vibrationEnabled],
  );

  const { containerId, state, error, cameras, activeCameraId, switchCamera, restart } = useQrScanner({
    onScan: handleScan,
    enabled: mode === 'auto' && scannerEnabled,
    locked: modalLock,
    cameraFacing: qrConfig.cameraFacing,
  });

  // Auto-mode progress bar after registering an operation
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoCountdown = useCallback(() => {
    setAutoProgress(0);
    const startTime = Date.now();
    autoTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / qrConfig.autoScanDelayMs) * 100);
      setAutoProgress(pct);
      if (pct >= 100) {
        if (autoTimerRef.current) {
          clearInterval(autoTimerRef.current);
          autoTimerRef.current = null;
        }
        setAutoProgress(0);
        setModalInfo(null);
        setModalLock(false);
        void restart();
      }
    }, 50);
  }, [restart, qrConfig.autoScanDelayMs]);

  const closeModal = useCallback(() => {
    setModalInfo(null);
    setModalLock(false);
    setNotification(null);
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoProgress(0);
  }, []);

  const submittingRef = useRef(false);

  const handleRegisterReoperation = useCallback(
    async (placaId: string | null, proceso: string, observaciones: string) => {
      if (!selectedProductionId) return;
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        await createReoperation({
          produccion_id: selectedProductionId,
          placa_id: placaId,
          proceso,
          operador: displayName,
          usuario: session?.user.email ?? '',
          estado: 'pendiente',
          observaciones,
        });
        await insertHistorial({
          produccion_id: selectedProductionId,
          placa_id: placaId,
          tipo_operacion: 'reoperacion',
          proceso,
          operador: displayName,
          usuario: session?.user.email ?? '',
          estado_anterior: '',
          estado_nuevo: 'pendiente',
          observaciones,
        });
        await loadTotals();
        void reload();
        setNotification(`Reoperación registrada. Continuando en ${qrConfig.autoScanDelayMs / 1000} segundos...`);
        if (mode === 'auto') {
          startAutoCountdown();
        }
      } finally {
        submittingRef.current = false;
      }
    },
    [selectedProductionId, displayName, session, loadTotals, reload, mode, startAutoCountdown, qrConfig.autoScanDelayMs],
  );

  const handleRegisterRecuperacion = useCallback(
    async (placaId: string | null, tipoRecuperacion: string, observaciones: string) => {
      if (!selectedProductionId) return;
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        await createRecuperacion({
          produccion_id: selectedProductionId,
          placa_id: placaId,
          operador: displayName,
          usuario: session?.user.email ?? '',
          tipo_recuperacion: tipoRecuperacion,
          observaciones,
        });
        await insertHistorial({
          produccion_id: selectedProductionId,
          placa_id: placaId,
          tipo_operacion: 'recuperacion',
          proceso: '',
          operador: displayName,
          usuario: session?.user.email ?? '',
          estado_anterior: '',
          estado_nuevo: 'completo',
          observaciones,
        });
        await loadTotals();
        void reload();
        setNotification(`Recuperación registrada. Continuando en ${qrConfig.autoScanDelayMs / 1000} segundos...`);
        if (mode === 'auto') {
          startAutoCountdown();
        }
      } finally {
        submittingRef.current = false;
      }
    },
    [selectedProductionId, displayName, session, loadTotals, reload, mode, startAutoCountdown, qrConfig.autoScanDelayMs],
  );

  const handleManualSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProductionId || !manualSerie.trim() || !manualPosicion) return;
    setManualSearching(true);
    setManualError(null);
    try {
      const placa = await findPlaca(selectedProductionId, manualSerie.trim(), manualPosicion);
      if (!placa) {
        setManualError('No se encontró una placa con esa serie y posición en la producción activa.');
        setModalInfo({
          placa: null,
          reopsCount: 0,
          recuperacionesCount: 0,
          hasPendingReoperation: false,
          parsed: { serie: manualSerie.trim(), posicion: manualPosicion, posicionNormalizada: manualPosicion, complementaria: '', raw: '' },
          notFound: true,
        });
      } else {
        const placaReops = await listReoperacionesByPlaca(placa.id);
        const allRecups = await listRecuperacionesByProduction(selectedProductionId);
        const placaRecups = allRecups.filter((r) => r.placa_id === placa.id).length;
        const hasPending = placaReops.some((r) => r.estado === 'pendiente');
        setLastSerie(placa.serie);
        setLastPosicion(placa.posicion);
        setModalInfo({
          placa,
          reopsCount: placaReops.length,
          recuperacionesCount: placaRecups,
          hasPendingReoperation: hasPending,
          parsed: { serie: placa.serie, posicion: placa.posicion, posicionNormalizada: placa.posicion as PlatePosition, complementaria: '', raw: '' },
          notFound: false,
        });
        setManualSerie('');
        setManualPosicion('');
      }
    } catch {
      setManualError('Error al buscar la placa.');
    } finally {
      setManualSearching(false);
    }
  };

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, []);

  if (!selectedProductionId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Operación" title="Lector QR" description="Escanea la etiqueta de la placa para registrar una reoperación o recuperación." />
        <SelectedProductionBanner onNavigate={onNavigate} />
        <div className="rounded-2xl border border-dashed border-warning/30 bg-warning/10 p-6 text-center">
          <p className="font-medium text-warning">Selecciona una producción para empezar a escanear.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Lector QR"
        description="Escanea la etiqueta de la placa para registrar una reoperación o recuperación."
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      {/* Scanner / Manual section - first, primary focus */}
      {mode === 'auto' ? (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          {/* Camera error */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <CameraOff className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Error de cámara</p>
                <p className="mt-0.5 text-xs">{error}</p>
                <button
                  type="button"
                  onClick={() => void restart()}
                  className="mt-2 flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-destructive"
                >
                  <RefreshCw className="h-3 w-3" />
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Scanner container */}
          <div className="flex flex-col items-center gap-4">
            <div
              id={containerId}
              className="overflow-hidden rounded-2xl border-2 border-border bg-primary [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
              style={{ width: '100%', maxWidth: 420, aspectRatio: '1 / 1' }}
            />

            {state === 'starting' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Iniciando cámara...
              </div>
            )}
            {state === 'scanning' && !modalLock && (
              <div className="flex items-center gap-2 text-sm text-success">
                <Camera className="h-4 w-4" />
                Cámara activa. Apunta al código QR de la placa.
              </div>
            )}
            {modalLock && (
              <div className="flex items-center gap-2 text-sm text-accent">
                <ScanLine className="h-4 w-4" />
                Cámara en pausa. Cierra la ventana para reanudar.
              </div>
            )}
            {state === 'stopped' && !modalLock && (
              <p className="text-sm text-muted-foreground">Cámara detenida.</p>
            )}

            {/* Camera switcher */}
            {cameras.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Cambiar cámara:</span>
                {cameras.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => void switchCamera(cam.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      activeCameraId === cam.id
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-card text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>
            )}

            {/* Scan next button */}
            <button
              type="button"
              onClick={() => { closeModal(); void restart(); }}
              className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-accent active:scale-[0.98]"
            >
              <RefreshCw className="h-4 w-4" />
              Escanear siguiente
            </button>

            {/* Auto-mode progress bar */}
            {autoProgress > 0 && (
              <div className="w-full max-w-xs">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-75"
                    style={{ width: `${autoProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-xs text-muted-foreground">Reanudando escaneo...</p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary/80">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">Búsqueda manual</h2>
              <p className="text-sm text-muted-foreground">Escribe la serie y posición de la placa para buscarla.</p>
            </div>
          </div>

          <form onSubmit={handleManualSearch} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="manual-serie" className="block text-sm font-medium text-foreground/80">Serie</label>
                <input
                  id="manual-serie"
                  type="text"
                  value={manualSerie}
                  onChange={(e) => setManualSerie(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="Ej: 72SHE1"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="manual-posicion" className="block text-sm font-medium text-foreground/80">Posición</label>
                <select
                  id="manual-posicion"
                  value={manualPosicion}
                  onChange={(e) => setManualPosicion(e.target.value as PlatePosition | '')}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">Selecciona posición</option>
                  <option value="FRONTAL">FRONTAL</option>
                  <option value="TRASERA">TRASERA</option>
                </select>
              </div>
            </div>
            {manualError && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{manualError}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={manualSearching || !manualSerie.trim() || !manualPosicion}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70"
            >
              {manualSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
              {manualSearching ? 'Buscando...' : 'Buscar placa'}
            </button>
          </form>
        </section>
      )}

      {/* Mode toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
        <div className="flex gap-2 rounded-xl border border-border bg-card p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => { setMode('auto'); setScannerEnabled(true); }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              mode === 'auto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {mode === 'auto' ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
            Automático
          </button>
          <button
            type="button"
            onClick={() => { setMode('manual'); setScannerEnabled(false); }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              mode === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <Keyboard className="h-4 w-4" />
            Manual
          </button>
        </div>
      </div>

      {/* Operator info + stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{roleLabel}</p>
            <p className="truncate font-semibold text-primary">{displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <RotateCw className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reoperaciones</p>
            <p className="text-xl font-bold tabular-nums text-primary">{totalReops}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recuperaciones</p>
            <p className="text-xl font-bold tabular-nums text-primary">{totalRecuperaciones}</p>
          </div>
        </div>
      </div>

      {/* Last scan info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <QrCode className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última serie leída</p>
            <p className="font-mono font-semibold text-primary">{lastSerie ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <ScanLine className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última posición leída</p>
            <p className="font-semibold text-primary">{lastPosicion ?? '—'}</p>
          </div>
        </div>
      </div>

      <StatusLegend />

      {/* Notification */}
      {notification && !modalInfo && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg">
            <CheckCircle2 className="h-4 w-4" />
            {notification}
          </div>
        </div>
      )}

      {/* Placa info modal */}
      {modalInfo && (
        <PlacaInfoModal
          info={modalInfo}
          operadorName={displayName}
          userEmail={session?.user.email ?? ''}
          produccionId={selectedProductionId ?? ''}
          onClose={closeModal}
          onRegisterReoperation={handleRegisterReoperation}
          onRegisterRecuperacion={handleRegisterRecuperacion}
        />
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}
