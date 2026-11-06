import { HorizontalBars } from '@/components/reports/HorizontalBars';
import { OperationStatusBadge, SERVICE_STATUS_LABELS } from '@/components/metrics/OperationStatusBadge';
import { percent } from '@/lib/operationMetrics';
import { formatPercent } from '@/lib/percentFormat';
import type { ServiceMetricRow } from '@/services/metricsService';

interface ServiceRecoveryCardProps {
  service: ServiceMetricRow;
}

export function ServiceRecoveryCard({ service }: ServiceRecoveryCardProps) {
  const roCompletadas = service.reoperaciones - service.pendientes;
  const placasSinReoperacion = Math.max(0, service.placas - service.placasAfectadas);
  const roPct = percent(service.reoperaciones, service.placas);
  const completadasPct = percent(roCompletadas, service.placas);
  const pendientesPct = percent(service.pendientes, service.placas);
  const sinReoperacionPct = percent(placasSinReoperacion, service.placas);
  const hintOf = (pct: number) => `${formatPercent(pct)} de las placas`;

  return (
    <article className="flex w-full flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-primary">{service.servicio}</h3>
          <p className="text-xs text-muted-foreground">{service.tipoServicio === 'JGS' ? 'Tipo JGS' : 'Tipo PZ'}</p>
        </div>
        <OperationStatusBadge status={service.estado} labels={SERVICE_STATUS_LABELS} />
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <dl className="grid grid-cols-3 gap-3">
            <Stat label="Placas" value={service.placas} />
            <Stat label="Cajas" value={service.cajas} />
            <Stat label="Cajas con RO" value={service.cajasConReoperaciones} tone="warning" />
          </dl>

          <dl className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-4">
            <Stat label="RO totales" value={service.reoperaciones} hint={hintOf(roPct)} />
            <Stat label="RO pendientes" value={service.pendientes} hint={hintOf(pendientesPct)} tone="warning" />
            <Stat label="RO completadas" value={roCompletadas} hint={hintOf(completadasPct)} tone="success" />
          </dl>

          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-foreground/80">Reoperaciones sobre el total de placas</span>
              <span className="font-semibold tabular-nums text-primary">{formatPercent(roPct)}</span>
            </div>
            <div
              role="img"
              aria-label={`${formatPercent(completadasPct)} completadas, ${formatPercent(pendientesPct)} pendientes y ${formatPercent(sinReoperacionPct)} sin reoperación`}
              className="flex h-3 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full bg-success transition-[width] duration-700 ease-out" style={{ width: `${completadasPct}%` }} />
              <div className="h-full bg-warning transition-[width] duration-700 ease-out" style={{ width: `${pendientesPct}%` }} />
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <Legend dotClass="bg-success" text={`Completadas ${formatPercent(completadasPct)}`} />
              <Legend dotClass="bg-warning" text={`Pendientes ${formatPercent(pendientesPct)}`} />
              <Legend dotClass="bg-muted-foreground/40" text={`Sin RO ${formatPercent(sinReoperacionPct)}`} />
            </ul>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RO por proceso</p>
          <HorizontalBars
            items={service.procesos.map((p) => ({ label: p.proceso, value: p.total }))}
            emptyText="Sin reoperaciones registradas."
          />
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'warning' | 'success' }) {
  const toneClass = tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-primary';
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</dd>
      {hint && <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Legend({ dotClass, text }: { dotClass: string; text: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      {text}
    </li>
  );
}
