import { useCallback, useEffect, useState } from 'react';
import { Camera, Keyboard, Volume2, Vibrate, Zap, ZapOff } from 'lucide-react';
import {
  loadQrReaderConfig,
  saveQrReaderConfig,
  DEFAULT_QR_CONFIG,
  playBeep,
  vibrate,
  type CameraFacingPreference,
  type QrReaderConfig,
  type QrScanMode,
} from '@/lib/qrConfig';

const TOGGLE_CLASS = (active: boolean) =>
  `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
    active ? 'bg-accent' : 'bg-muted-foreground/40'
  }`;

const KNOB_CLASS = `inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform`;

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={TOGGLE_CLASS(checked)}
    >
      <span className={KNOB_CLASS + ' ' + (checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

export function QrReaderConfigSection() {
  const [config, setConfig] = useState<QrReaderConfig>(DEFAULT_QR_CONFIG);

  useEffect(() => {
    setConfig(loadQrReaderConfig());
  }, []);

  const update = useCallback(<K extends keyof QrReaderConfig>(key: K, value: QrReaderConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      saveQrReaderConfig(next);
      return next;
    });
  }, []);

  const testSound = () => {
    if (config.soundEnabled) playBeep();
    if (config.vibrationEnabled) vibrate(100);
  };

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary/80">
          <Camera className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-primary">Configuración del lector</h2>
          <p className="text-sm text-muted-foreground">Ajusta el comportamiento del escáner de códigos QR.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground/80">Cámara predeterminada</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update('cameraFacing', 'rear' as CameraFacingPreference)}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                config.cameraFacing === 'rear'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
              }`}
            >
              Trasera
            </button>
            <button
              type="button"
              onClick={() => update('cameraFacing', 'front' as CameraFacingPreference)}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                config.cameraFacing === 'front'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
              }`}
            >
              Frontal
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground/80">Modo de escaneo</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update('scanMode', 'auto' as QrScanMode)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                config.scanMode === 'auto'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {config.scanMode === 'auto' ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
              Automático
            </button>
            <button
              type="button"
              onClick={() => update('scanMode', 'manual' as QrScanMode)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                config.scanMode === 'manual'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Keyboard className="h-4 w-4" />
              Manual
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="scan-delay" className="block text-sm font-medium text-foreground/80">
            Tiempo entre lecturas (automático): {config.autoScanDelayMs / 1000} s
          </label>
          <input
            id="scan-delay"
            type="range"
            min={1000}
            max={10000}
            step={500}
            value={config.autoScanDelayMs}
            onChange={(e) => update('autoScanDelayMs', parseInt(e.target.value, 10))}
            className="w-full accent-accent"
          />
          <p className="text-xs text-muted-foreground">Predeterminado: 3 segundos</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground/80">Sonido al escanear</span>
            </div>
            <Toggle checked={config.soundEnabled} onChange={(v) => update('soundEnabled', v)} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Vibrate className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground/80">Vibración al escanear</span>
            </div>
            <Toggle checked={config.vibrationEnabled} onChange={(v) => update('vibrationEnabled', v)} />
          </div>
          <button
            type="button"
            onClick={testSound}
            disabled={!config.soundEnabled && !config.vibrationEnabled}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/50 disabled:opacity-50"
          >
            Probar sonido y vibración
          </button>
        </div>
      </div>
    </section>
  );
}
