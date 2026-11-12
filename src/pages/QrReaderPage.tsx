import { useCallback, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  Keyboard,
  Layers,
  Loader2,
  PackageCheck,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  Zap,
  ZapOff,
} from 'lucide-react';
import { PlacaInfoModal, type PlacaInfo } from '@/components/qr/PlacaInfoModal';
import { BatchReoperationPanel } from '@/components/qr/BatchReoperationPanel';
import { BoxClosePanel } from '@/components/qr/BoxClosePanel';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductionData } from '@/hooks/useProductionData';
import { useQrScanner } from '@/hooks/useQrScanner';
import { parseQrContent } from '@/services/qrService';
import { loadQrReaderConfig, playBeep, vibrate, type QrReaderConfig } from '@/lib/qrConfig';
import {
  findPlaca,
  isBoxClosed,
  listReoperacionesByPlaca,
  listRecuperacionesByProduction,
  createReoperation,
  createRecuperacion,
  insertHistorial,
  anularReoperacionesPlaca,
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
  const [modalInfo, setModalInfo] = useState<PlacaInfo | null>(null);
  const [modalLock, setModalLock] = useState(false);
  const [lastSerie, setLastSerie] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [closeBoxOpen, setCloseBoxOpen] = useState(false);

  // Manual mode form
  const [manualSerie, setManualSerie] = useState('');
  const [manualPosicion, setManualPosicion] = useState<PlatePosition | ''>('');
  const [manualSearching, setManualSearching] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const displayName = operatorName ?? profile?.full_name ?? profile?.email ?? '—';
  const userEmail = session?.user.email ?? '';

  // Handle QR scan
  const handleScan = useCallback(
    async (decodedText: string) => {
      if (modalLock || !selectedProductionId) return;

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
        return;
      }

      setLastSerie(parsed.serie);

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
          const boxClosed = await isBoxClosed(selectedProductionId, placa.servicio, placa.numero_caja);
          setModalInfo({
            placa,
            reopsCount: placaReops.length,
            recuperacionesCount: placaRecups,
            hasPendingReoperation: hasPending,
            boxClosed,
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

  const { containerId, state, error, restart } = useQrScanner({
    onScan: handleScan,
    enabled: mode === 'auto',
    locked: modalLock || batchOpen || closeBoxOpen,
    cameraFacing: qrConfig.cameraFacing,
  });

  const closeModal = useCallback(() => {
    setModalInfo(null);
    setModalLock(false);
  }, []);

  const submittingRef = useRef(false);

  // One-step registration: save + close modal + scanner auto-resumes via locked=false
  const handleRegisterReoperation = useCallback(
    async (placaId: string | null, proceso: string, observaciones: string) => {
      if (!selectedProductionId) return;
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        if (placaId && modalInfo?.placa) {
          const closed = await isBoxClosed(selectedProductionId, modalInfo.placa.servicio, modalInfo.placa.numero_caja);
          if (closed) throw new Error('La caja de esta placa está cerrada. No se puede guardar la reoperación.');
        }
        await createReoperation({
          produccion_id: selectedProductionId,
          placa_id: placaId,
          proceso,
          operador: displayName,
          usuario: userEmail,
          estado: 'pendiente',
          observaciones,
        });
        await insertHistorial({
          produccion_id: selectedProductionId,
          placa_id: placaId,
          tipo_operacion: 'reoperacion',
          proceso,
          operador: displayName,
          usuario: userEmail,
          estado_anterior: '',
          estado_nuevo: 'pendiente',
          observaciones,
        });
        void reload();
        closeModal();
      } finally {
        submittingRef.current = false;
      }
    },
    [selectedProductionId, displayName, userEmail, reload, closeModal, modalInfo],
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
          usuario: userEmail,
          tipo_recuperacion: tipoRecuperacion,
          observaciones,
        });
        await insertHistorial({
          produccion_id: selectedProductionId,
          placa_id: placaId,
          tipo_operacion: 'recuperacion',
          proceso: '',
          operador: displayName,
          usuario: userEmail,
          estado_anterior: '',
          estado_nuevo: 'completo',
          observaciones,
        });
        void reload();
        closeModal();
      } finally {
        submittingRef.current = false;
      }
    },
    [selectedProductionId, displayName, userEmail, reload, closeModal],
  );

  const handleAnularReoperaciones = useCallback(
    async (placaId: string, motivo: string) => {
      if (!selectedProductionId) return;
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        await anularReoperacionesPlaca({
          produccion_id: selectedProductionId,
          placa_id: placaId,
          motivo,
          operador: displayName,
          usuario: userEmail,
        });
        void reload();
        closeModal();
      } finally {
        submittingRef.current = false;
      }
    },
    [selectedProductionId, displayName, userEmail, reload, closeModal],
  );

  const handleManualSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProductionId || !manualSerie.trim() || !manualPosicion) return;
    setManualSearching(true);
    setManualError(null);
    setModalLock(true);
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
        const boxClosed = await isBoxClosed(selectedProductionId, placa.servicio, placa.numero_caja);
        setLastSerie(placa.serie);
        setModalInfo({
          placa,
          reopsCount: placaReops.length,
          recuperacionesCount: placaRecups,
          hasPendingReoperation: hasPending,
          boxClosed,
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

  if (!selectedProductionId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Operación" title="Lector QR" description="Escanea la etiqueta de la placa para registrar una reoperación o recuperación." />
        <div className="rounded-2xl border border-dashed border-warning/30 bg-warning/10 p-6 text-center">
          <p className="font-medium text-warning">Selecciona una producción en el menú para empezar a escanear.</p>
          <button
            type="button"
            onClick={() => onNavigate('/producciones')}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary"
          >
            Ir a producciones
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operación"
        title="Lector QR"
        description="Escanea la etiqueta de la placa para registrar una reoperación o recuperación."
      />

      {/* Scanner / Manual section - first, primary focus */}
      {mode === 'auto' ? (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
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

          <div className="flex flex-col items-center gap-3">
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
            {state === 'scanning' && !modalLock && !batchOpen && !closeBoxOpen && (
              <div className="flex items-center gap-2 text-sm text-success">
                <Camera className="h-4 w-4" />
                Escaneando...
              </div>
            )}
            {(modalLock || batchOpen || closeBoxOpen) && (
              <div className="flex items-center gap-2 text-sm text-accent">
                <ScanLine className="h-4 w-4" />
                Cámara en pausa
              </div>
            )}
            {state === 'stopped' && !modalLock && !batchOpen && !closeBoxOpen && (
              <p className="text-sm text-muted-foreground">Cámara detenida.</p>
            )}

            <button
              type="button"
              onClick={() => { closeModal(); void restart(); }}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-accent active:scale-[0.98]"
            >
              <RefreshCw className="h-4 w-4" />
              Escanear siguiente
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary/80">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">Búsqueda manual</h2>
              <p className="text-sm text-muted-foreground">Escribe la serie y posición de la placa.</p>
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
              {manualSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {manualSearching ? 'Buscando...' : 'Buscar placa'}
            </button>
          </form>
        </section>
      )}

      {/* Mode toggle + Batch button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
        <div className="flex gap-2 rounded-xl border border-border bg-card p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setMode('auto')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              mode === 'auto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {mode === 'auto' ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
            Automático
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              mode === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <Keyboard className="h-4 w-4" />
            Manual
          </button>
        </div>
        <button
          type="button"
          onClick={() => setBatchOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-5 py-2.5 text-sm font-semibold text-warning shadow-sm transition hover:bg-warning/20"
        >
          <Layers className="h-4 w-4" />
          Reoperación por lote
        </button>
        <button
          type="button"
          onClick={() => setCloseBoxOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-success/30 bg-success/10 px-5 py-2.5 text-sm font-semibold text-success shadow-sm transition hover:bg-success/20"
        >
          <PackageCheck className="h-4 w-4" />
          Cerrar cajas
        </button>
      </div>

      {/* Last scan info - single card */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <QrCode className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última serie leída</p>
          <p className="font-mono font-semibold text-primary">{lastSerie ?? '—'}</p>
        </div>
      </div>

      {/* Placa info modal */}
      {modalInfo && (
        <PlacaInfoModal
          info={modalInfo}
          onClose={closeModal}
          onRegisterReoperation={handleRegisterReoperation}
          onRegisterRecuperacion={handleRegisterRecuperacion}
          onAnularReoperaciones={handleAnularReoperaciones}
        />
      )}

      {/* Batch reoperation panel */}
      <BatchReoperationPanel
        produccionId={selectedProductionId}
        operador={displayName}
        usuario={userEmail}
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        onCompleted={() => {
          setBatchOpen(false);
          void reload();
        }}
      />

      <BoxClosePanel
        produccionId={selectedProductionId}
        operador={displayName}
        usuario={userEmail}
        open={closeBoxOpen}
        onClose={() => setCloseBoxOpen(false)}
        onCompleted={() => void reload()}
      />
    </div>
  );
}
