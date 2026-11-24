import { useCallback, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Package,
  QrCode,
  RefreshCw,
  ScanLine,
} from 'lucide-react';
import { CompletadoInfoModal } from '@/components/completado/CompletadoInfoModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductionData } from '@/hooks/useProductionData';
import { useQrScanner } from '@/hooks/useQrScanner';
import { parseQrContent } from '@/services/qrService';
import { loadQrReaderConfig, playBeep, vibrate, type QrReaderConfig } from '@/lib/qrConfig';
import { findPlaca } from '@/services/operationService';
import { marcarPlacaCompletada, obtenerAvanceProduccion, type AvanceProduccion, type MarcarPlacaResult } from '@/services/completadoService';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

interface ModalState {
  result: MarcarPlacaResult | null;
  placaInfo: { serie: string; posicion: string; servicio: string; numero_caja: string } | null;
  notFound: boolean;
  notFoundSerie: string | null;
}

export function CompletadoQrPage({ onNavigate }: ScreenProps) {
  const { profile, session } = useAuth();
  const { operatorName, selectedProductionId } = useProductionSelection();
  const { reload } = useProductionData(selectedProductionId);
  const [qrConfig] = useState<QrReaderConfig>(loadQrReaderConfig);

  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [modalLock, setModalLock] = useState(false);
  const [lastSerie, setLastSerie] = useState<string | null>(null);
  const [avance, setAvance] = useState<AvanceProduccion | null>(null);
  const [avanceLoading, setAvanceLoading] = useState(false);

  const displayName = operatorName ?? profile?.full_name ?? profile?.email ?? '—';
  const userEmail = session?.user.email ?? '';

  const loadAvance = useCallback(async () => {
    if (!selectedProductionId) return;
    setAvanceLoading(true);
    try {
      const data = await obtenerAvanceProduccion(selectedProductionId);
      setAvance(data);
    } catch {
      setAvance(null);
    } finally {
      setAvanceLoading(false);
    }
  }, [selectedProductionId]);

  const handleScan = useCallback(
    async (decodedText: string) => {
      if (modalLock || !selectedProductionId) return;

      if (qrConfig.soundEnabled) playBeep();
      if (qrConfig.vibrationEnabled) vibrate(80);
      setModalLock(true);

      const parsed = parseQrContent(decodedText);

      if (!parsed.serie || !parsed.posicionNormalizada) {
        setModalState({
          result: null,
          placaInfo: null,
          notFound: true,
          notFoundSerie: parsed.serie || null,
        });
        setLastSerie(parsed.serie || '—');
        return;
      }

      setLastSerie(parsed.serie);

      try {
        const placa = await findPlaca(selectedProductionId, parsed.serie, parsed.posicionNormalizada);
        if (!placa) {
          setModalState({
            result: null,
            placaInfo: null,
            notFound: true,
            notFoundSerie: parsed.serie,
          });
        } else {
          const result = await marcarPlacaCompletada(
            selectedProductionId,
            placa.id,
            displayName,
            userEmail,
          );
          setModalState({
            result,
            placaInfo: { serie: placa.serie, posicion: placa.posicion, servicio: placa.servicio, numero_caja: placa.numero_caja },
            notFound: false,
            notFoundSerie: null,
          });
          void loadAvance();
          void reload();
        }
      } catch {
        setModalState({
          result: null,
          placaInfo: null,
          notFound: true,
          notFoundSerie: parsed.serie,
        });
      }
    },
    [modalLock, selectedProductionId, qrConfig.soundEnabled, qrConfig.vibrationEnabled, displayName, userEmail, loadAvance, reload],
  );

  const { containerId, state, error, restart } = useQrScanner({
    onScan: handleScan,
    enabled: true,
    locked: modalLock,
    cameraFacing: qrConfig.cameraFacing,
  });

  const closeModal = useCallback(() => {
    setModalState(null);
    setModalLock(false);
  }, []);

  // Cargar avance al montar
  const mountedRef = useRef(false);
  if (!mountedRef.current && selectedProductionId) {
    mountedRef.current = true;
    void loadAvance();
  }

  if (!selectedProductionId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Operación" title="Completado QR" description="Escanea placas para marcarlas como completadas." />
        <div className="rounded-2xl border border-dashed border-warning/30 bg-warning/10 p-6 text-center">
          <p className="font-medium text-warning">Selecciona una producción en el menú para empezar.</p>
          <button
            type="button"
            onClick={() => onNavigate('/produccion')}
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
        title="Completado QR"
        description="Escanea la etiqueta de la placa para marcarla como completada. La caja se cierra automáticamente al completar todas sus placas."
      />

      {/* KPIs de avance */}
      {avance && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard icon={CheckCircle2} label="Placas completadas" value={avance.placas_completadas} tone="emerald" hint="Placas marcadas como completadas." />
          <KpiCard icon={ScanLine} label="Pendientes por completar" value={avance.placas_pendientes} tone="amber" hint="Placas que aún no se escanean." />
          <KpiCard icon={QrCode} label="Total de placas" value={avance.total_placas} tone="navy" hint="Total en la producción activa." />
          <KpiCard icon={Package} label="Avance" value={`${avance.porcentaje_completado}%`} tone="emerald" hint="Porcentaje completado." />
        </div>
      )}

      {/* Scanner — solo lectura QR, sin entrada manual */}
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
          {state === 'scanning' && !modalLock && (
            <div className="flex items-center gap-2 text-sm text-success">
              <Camera className="h-4 w-4" />
              Escaneando...
            </div>
          )}
          {modalLock && (
            <div className="flex items-center gap-2 text-sm text-accent">
              <ScanLine className="h-4 w-4" />
              Cámara en pausa
            </div>
          )}
          {state === 'stopped' && !modalLock && (
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

      {/* Avance por servicio */}
      {avance && avance.servicios.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-primary">Avance por servicio</h3>
          <div className="mt-4 space-y-3">
            {avance.servicios.map((s) => (
              <div key={s.servicio} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{s.servicio}</span>
                  <span className="text-muted-foreground">
                    {s.completadas} / {s.total_placas} <span className="font-semibold text-primary">({s.porcentaje}%)</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-success transition-all duration-500"
                    style={{ width: `${s.porcentaje}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last scan */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <QrCode className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última serie leída</p>
          <p className="font-mono font-semibold text-primary">{lastSerie ?? '—'}</p>
        </div>
      </div>

      {modalState && (
        <CompletadoInfoModal
          result={modalState.result}
          placaInfo={modalState.placaInfo}
          notFound={modalState.notFound}
          notFoundSerie={modalState.notFoundSerie}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
