export type CameraFacingPreference = 'rear' | 'front';
export type QrScanMode = 'auto' | 'manual';

export interface QrReaderConfig {
  cameraFacing: CameraFacingPreference;
  scanMode: QrScanMode;
  autoScanDelayMs: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const DEFAULT_QR_CONFIG: QrReaderConfig = {
  cameraFacing: 'rear',
  scanMode: 'auto',
  autoScanDelayMs: 3000,
  soundEnabled: true,
  vibrationEnabled: true,
};

const STORAGE_KEY = 'reoperaciones.qrReaderConfig';

function isConfig(value: unknown): value is QrReaderConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.cameraFacing === 'rear' || v.cameraFacing === 'front') &&
    (v.scanMode === 'auto' || v.scanMode === 'manual') &&
    typeof v.autoScanDelayMs === 'number' &&
    v.autoScanDelayMs >= 1000 &&
    v.autoScanDelayMs <= 10000 &&
    typeof v.soundEnabled === 'boolean' &&
    typeof v.vibrationEnabled === 'boolean'
  );
}

export function loadQrReaderConfig(): QrReaderConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QR_CONFIG;
    const parsed = JSON.parse(raw);
    return isConfig(parsed) ? parsed : DEFAULT_QR_CONFIG;
  } catch {
    return DEFAULT_QR_CONFIG;
  }
}

export function saveQrReaderConfig(config: QrReaderConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // storage may be unavailable in private mode
  }
}

export function playBeep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => ctx.close(), 200);
  } catch {
    // audio not available
  }
}

export function vibrate(durationMs: number): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(durationMs);
  } catch {
    // vibration not supported
  }
}
