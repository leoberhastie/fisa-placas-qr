import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'error' | 'stopped';

interface CameraDevice {
  id: string;
  label: string;
}

interface UseQrScannerOptions {
  onScan: (decodedText: string) => void;
  enabled: boolean;
  /** While locked the camera is paused; it resumes automatically when unlocked. */
  locked: boolean;
  cameraFacing?: 'rear' | 'front';
}

const BACK_CAMERA_PATTERN = /back|rear|environment|trasera|posterior/i;
const FRONT_CAMERA_PATTERN = /front|user|delantera|frontal/i;
const SECONDARY_LENS_PATTERN = /ultra|wide|macro|tele|depth|infrared|\bir\b/i;

function pickPreferredCamera(cameras: CameraDevice[], facing: 'rear' | 'front'): CameraDevice | undefined {
  if (facing === 'front') {
    return cameras.find((c) => FRONT_CAMERA_PATTERN.test(c.label)) ?? cameras[0];
  }
  const backCameras = cameras.filter((c) => BACK_CAMERA_PATTERN.test(c.label));
  const mainBack = backCameras.find((c) => !SECONDARY_LENS_PATTERN.test(c.label));
  return mainBack ?? backCameras[0] ?? cameras[cameras.length - 1];
}

export function useQrScanner({ onScan, enabled, locked, cameraFacing = 'rear' }: UseQrScannerOptions) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader-container';
  const [state, setState] = useState<ScannerState>('idle');
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  const lockedRef = useRef(locked);
  const enabledRef = useRef(false);
  const activeCameraIdRef = useRef<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        await scanner.clear();
      } catch {
        // the browser may already have released the camera
      }
    }
    setState('stopped');
  }, []);

  const startScanner = useCallback(async (cameraId: string) => {
    if (!enabledRef.current) return;
    setState('starting');
    setError(null);

    try {
      const scanner = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        cameraId,
        {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
            return { width: Math.max(160, edge), height: Math.max(160, edge) };
          },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          if (!lockedRef.current) onScanRef.current(decodedText);
        },
        () => {
          // per-frame decode misses are expected
        },
      );

      if (!enabledRef.current) {
        await stopScanner();
        return;
      }
      activeCameraIdRef.current = cameraId;
      setState('scanning');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la cámara.');
    }
  }, [stopScanner]);

  useEffect(() => {
    if (!enabled) return;
    enabledRef.current = true;
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
        const preferred = pickPreferredCamera(mapped, cameraFacing);
        if (preferred) await startScanner(preferred.id);
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
      enabledRef.current = false;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !activeCameraIdRef.current) return;
    if (locked) {
      void stopScanner();
    } else {
      void startScanner(activeCameraIdRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const restart = useCallback(async () => {
    const cameraId = activeCameraIdRef.current;
    if (!cameraId) return;
    await stopScanner();
    await startScanner(cameraId);
  }, [startScanner, stopScanner]);

  return { containerId, state, error, restart };
}
