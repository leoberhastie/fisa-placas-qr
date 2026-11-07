import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Eye, Loader2, Upload } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  getServiceBoxBounds,
  previewServiceBoxPlan,
  replaceServiceBoxPlan,
  type ServiceBoxBounds,
  type ServiceBoxPlanInput,
  type ServiceBoxPlanRow,
  type ServiceBoxReplaceProgress,
} from '@/services/serviceBoxPlanService';
import type { ServiceType } from '@/types/domain';

interface ServiceBoxRangeAssignerProps {
  productionId: string;
  servicio: string;
  tipo: ServiceType;
  onAssigned: () => void;
}

type Mode = 'auto' | 'manual';

const DEFAULT_PLACAS_POR_CAJA = 100;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function ServiceBoxRangeAssigner({ productionId, servicio, tipo, onAssigned }: ServiceBoxRangeAssignerProps) {
  const [bounds, setBounds] = useState<ServiceBoxBounds | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [serieInicial, setSerieInicial] = useState('');
  const [serieFinal, setSerieFinal] = useState('');
  const [placasPorCaja, setPlacasPorCaja] = useState(String(DEFAULT_PLACAS_POR_CAJA));
  const [plan, setPlan] = useState<ServiceBoxPlanRow[] | null>(null);
  const [planInput, setPlanInput] = useState<ServiceBoxPlanInput | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<ServiceBoxReplaceProgress | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const unidad = tipo === 'JGS' ? 'juegos' : 'piezas';
  const placasPorSerie = tipo === 'JGS' ? 2 : 1;

  useEffect(() => {
    let active = true;
    setLoadError(null);
    setBounds(null);
    getServiceBoxBounds(productionId, servicio)
      .then((result) => {
        if (!active) return;
        setBounds(result);
        setSerieInicial(result.serieInicial ?? '');
        setSerieFinal(result.serieFinal ?? '');
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(errorMessage(cause, 'No se pudieron consultar las placas del servicio.'));
      });
    return () => {
      active = false;
    };
  }, [productionId, servicio]);

  useEffect(() => {
    setPlan(null);
    setPlanInput(null);
    setFormError(null);
  }, [mode, serieInicial, serieFinal, placasPorCaja]);

  const buildInput = (): ServiceBoxPlanInput => {
    const piezas = Number(placasPorCaja);
    if (!Number.isInteger(piezas) || piezas <= 0) {
      throw new Error('Las placas por caja deben ser un número entero mayor que cero.');
    }
    const inicial = mode === 'auto' ? bounds?.serieInicial ?? '' : serieInicial.trim();
    const final = mode === 'auto' ? bounds?.serieFinal ?? '' : serieFinal.trim();
    if (!inicial || !final) {
      throw new Error('Indica la serie inicial y la serie final.');
    }
    return { produccionId: productionId, servicio, tipo, serieInicial: inicial, serieFinal: final, piezasPorCaja: piezas };
  };

  const handleVerify = async () => {
    setFormError(null);
    setMessage(null);
    setPlan(null);
    setVerifying(true);
    try {
      const input = buildInput();
      const rows = await previewServiceBoxPlan(input);
      if (rows.length === 0) throw new Error('No se generó ninguna caja con ese rango.');
      setPlan(rows);
      setPlanInput(input);
    } catch (cause) {
      setFormError(errorMessage(cause, 'No se pudo calcular la distribución de cajas.'));
    } finally {
      setVerifying(false);
    }
  };

  const handleConfirm = async () => {
    if (!planInput || !plan || !bounds || bounds.consecutivoMinimo === null || bounds.consecutivoMaximo === null) return;
    setSaving(true);
    setProgress(null);
    setFormError(null);
    try {
      const result = await replaceServiceBoxPlan(
        planInput,
        plan,
        { minimo: bounds.consecutivoMinimo, maximo: bounds.consecutivoMaximo },
        setProgress,
      );
      setMessage(`${result.cajas} cajas asignadas: ${result.series} ${unidad} y ${result.placas} placas físicas.`);
      setPlan(null);
      setPlanInput(null);
      onAssigned();
    } catch (cause) {
      setFormError(errorMessage(cause, 'No se pudo guardar la asignación de cajas. Vuelve a confirmar para completar el reemplazo.'));
    } finally {
      setConfirming(false);
      setSaving(false);
      setProgress(null);
    }
  };

  if (loadError) {
    return (
      <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {loadError}
      </p>
    );
  }

  if (!bounds) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Consultando placas del servicio...
      </p>
    );
  }

  if (bounds.placasTotal === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/50 px-6 py-10 text-center text-sm text-muted-foreground">
        Este servicio no tiene placas registradas en la producción.
      </div>
    );
  }

  const totalSeries = plan?.reduce((sum, row) => sum + row.cantidadSeries, 0) ?? 0;
  const totalPlacas = plan?.reduce((sum, row) => sum + row.cantidadPlacas, 0) ?? 0;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/40 p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Placas físicas</dt>
          <dd className="font-semibold tabular-nums text-primary">{bounds.placasTotal.toLocaleString('es-MX')}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Placa inicial / final</dt>
          <dd className="font-semibold tabular-nums text-primary">
            {bounds.consecutivoMinimo} / {bounds.consecutivoMaximo}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Serie inicial / final</dt>
          <dd className="font-mono text-xs font-semibold text-primary">
            {bounds.serieInicial} / {bounds.serieFinal}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cajas actuales</dt>
          <dd className="font-semibold tabular-nums text-primary">{bounds.cajasExistentes.toLocaleString('es-MX')}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold" role="tablist">
        {(['auto', 'manual'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => setMode(option)}
            className={`rounded-md px-3 py-2 transition-colors ${
              mode === option ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            {option === 'auto' ? 'Automática' : 'Por series'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'manual' ? (
          <>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Serie inicial</span>
              <input
                value={serieInicial}
                onChange={(event) => setSerieInicial(event.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Serie final</span>
              <input
                value={serieFinal}
                onChange={(event) => setSerieFinal(event.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
            Se usan la placa inicial y la placa final del servicio. Las cajas se calculan con el número de placas por caja.
          </p>
        )}
        <label className="space-y-1 sm:col-span-2 sm:max-w-xs">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Placas por caja (máximo)</span>
          <input
            type="number"
            min={placasPorSerie}
            step={placasPorSerie}
            value={placasPorCaja}
            onChange={(event) => setPlacasPorCaja(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <span className="block text-xs text-muted-foreground">
            {tipo === 'JGS'
              ? `Cada juego son ${placasPorSerie} placas. ${placasPorCaja || 0} placas equivalen a ${Math.floor(Number(placasPorCaja) / placasPorSerie)} juegos por caja.`
              : 'Cada pieza es una placa.'}
          </span>
        </label>
      </div>

      {saving && progress && (
        <p className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          <Loader2 className="h-4 w-4 animate-spin" />
          Guardando cajas: {progress.processedBoxes.toLocaleString('es-MX')} de {progress.totalBoxes.toLocaleString('es-MX')}
        </p>
      )}
      {saving && !progress && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Liberando placas del servicio...
        </p>
      )}

      {formError && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {formError}
        </p>
      )}
      {message && (
        <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleVerify()}
          disabled={verifying || saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {verifying ? 'Verificando...' : 'Verificar distribución'}
        </button>
      </div>

      {plan && planInput && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Cajas" value={plan.length} />
            <Stat label={tipo === 'JGS' ? 'Juegos' : 'Piezas'} value={totalSeries} />
            <Stat label="Placas físicas" value={totalPlacas} />
          </div>

          {bounds.cajasExistentes > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Al confirmar se reemplazarán las {bounds.cajasExistentes.toLocaleString('es-MX')} cajas actuales de este servicio.
            </p>
          )}

          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-xs">
              <thead className="sticky top-0 bg-muted text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Caja</th>
                  <th className="px-2 py-1.5 font-semibold">Series</th>
                  <th className="px-2 py-1.5 font-semibold">Placas</th>
                  <th className="px-2 py-1.5 font-semibold">Consecutivos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plan.map((row) => (
                  <tr key={row.orden}>
                    <td className="px-2 py-1.5 font-mono font-semibold text-primary">{row.numeroCaja}</td>
                    <td className="px-2 py-1.5 font-mono">
                      {row.serieInicial} – {row.serieFinal}
                      <span className="ml-2 text-muted-foreground">({row.cantidadSeries.toLocaleString('es-MX')})</span>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{row.cantidadPlacas.toLocaleString('es-MX')}</td>
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                      {row.consecutivoInicial} – {row.consecutivoFinal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Confirmar y reemplazar cajas
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Reemplazar cajas de ${servicio}`}
          message={`Se crearán ${plan?.length ?? 0} cajas con ${totalSeries.toLocaleString('es-MX')} ${unidad} y ${totalPlacas.toLocaleString('es-MX')} placas. Las asignaciones anteriores del servicio se eliminarán.`}
          confirmLabel="Sí, reemplazar"
          busy={saving}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-primary">{value.toLocaleString('es-MX')}</p>
    </div>
  );
}
