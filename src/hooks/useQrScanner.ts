import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'error' | 'stopped';

export interface CameraDevice {
  id: string;
  label: string;
}

interface UseQrScannerOptions {
  onScan: (decodedText: string) => void;
  enabled: boolean;
  /** Lock to prevent duplicate scans of the same QR while modal is open */
  locked: boolean;
  /** Preferred camera: 'rear' or 'front' */
  cameraFacing?: 'rear' | 'front';
}

export function useQrScanner({ onScan, enabled, locked, cameraFacing = 'rear' }: UseQrScannerOptions) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader-container';
  const [state, setState] = useState<ScannerState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  const lockedRef = useRef(locked);

  // Keep refs updated without re-starting scanner
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const s = scannerRef.current;
        if (s.isScanning) {
          await s.stop();
        }
        await s.clear();
      } catch {
        // ignore stop errors
      }
      scannerRef.current = null;
    }
    setState('stopped');
  }, []);

  const startScanner = useCallback(
    async (cameraId: string) => {
      if (!enabled) return;
      setState('starting');
      setError(null);

      try {
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(containerId);
        }

        await scannerRef.current.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText: string) => {
            if (!lockedRef.current) {
              onScanRef.current(decodedText);
            }
          },
          () => {
            // ignore per-frame decode errors
          },
        );

        setState('scanning');
        setActiveCameraId(cameraId);
      } catch (err) {
        setState('error');
        const msg = err instanceof Error ? err.message : 'No se pudo iniciar la cámara.';
        setError(msg);
      }
    },
    [enabled],
  );

  // Enumerate cameras and start with rear camera
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (!devices || devices.length === 0) {
          setState('error');
          setError('No se encontraron cámaras en este dispositivo.');
          return;
        }
        const mapped: CameraDevice[] = devices.map((d) => ({ id: d.id, label: d.label || `Cámara ${d.id.slice(0, 6)}` }));
        setCameras(mapped);

        // Prefer rear/back camera
        const rear = cameraFacing === 'front'
          ? mapped.find((c) => /front|user|delantera|frontal/i.test(c.label))
          : mapped.find((c) => /back|rear|environment|trasera|posterior/i.test(c.label));
        const fallback = cameraFacing === 'front' ? mapped[0] : mapped[mapped.length - 1];
        const preferred = rear?.id ?? fallback?.id ?? mapped[0].id;
        await startScanner(preferred);
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setError(
          err instanceof Error
            ? `Permiso de cámara denegado o no disponible: ${err.message}`
            : 'No se pudo acceder a la cámara.',
        );
      }
    })();

    return () => {
      cancelled = true;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const switchCamera = useCallback(
    async (cameraId: string) => {
      await stopScanner();
      await startScanner(cameraId);
    },
    [startScanner, stopScanner],
  );

  const restart = useCallback(async () => {
    if (activeCameraId) {
      await stopScanner();
      await startScanner(activeCameraId);
    }
  }, [activeCameraId, startScanner, stopScanner]);

  return {
    containerId,
    state,
    error,
    cameras,
    activeCameraId,
    switchCamera,
    stopScanner,
    restart,
  };
}
