import { HorizontalBars } from '@/components/reports/HorizontalBars';
import { OperationStatusBadge, SERVICE_STATUS_LABELS } from '@/components/metrics/OperationStatusBadge';
import { percent } from '@/lib/operationMetrics';
import { formatPercent } from '@/lib/percentFormat';
import type { ServiceMetricRow } from '@/services/metricsService';

interface ServiceRecoveryCardProps {
  service: ServiceMetricRow;
}

export function ServiceRecoveryCard({ service }: ServiceRecoveryCardProps) {
  const placasRecuperadas = Math.max(0, service.placasAfectadas - service.placasPendientes);
  const placasSinReoperacion = Math.max(0, service.placas - service.placasAfectadas);
  const roCompletadas = service.reoperaciones - service.pendientes;
  const recuperadasPct = percent(placasRecuperadas, service.placas);
  const pendientesPct = percent(service.placasPendientes, service.placas);
  const sinReoperacionPct = percent(placasSinReoperacion, service.placas);

  return (
    <article className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-primary">{service.servicio}</h3>
          <p className="text-xs text-muted-foreground">{service.tipoServicio === 'JGS' ? 'Tipo JGS' : 'Tipo PZ'}</p>
        </div>
        <OperationStatusBadge status={service.estado} labels={SERVICE_STATUS_LABELS} />
      </header>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Placas" value={service.placas} />
        <Stat label="Cajas" value={service.cajas} />
        <Stat label="Cajas con RO" value={service.cajasConReoperaciones} tone="warning" />
      </dl>

      <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
        <Stat label="RO totales" value={service.reoperaciones} />
        <Stat label="RO pendientes" value={service.pendientes} tone="warning" />
        <Stat label="RO completadas" value={roCompletadas} tone="success" />
      </dl>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-foreground/80">Placas recuperadas</span>
          <span className="font-semibold tabular-nums text-primary">{formatPercent(recuperadasPct)}</span>
        </div>
        <div
          role="img"
          aria-label={`${placasRecuperadas} recuperadas, ${service.placasPendientes} pendientes y ${placasSinReoperacion} sin reoperación de ${service.placas} placas`}
          className="flex h-3 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-success transition-[width] duration-700 ease-out" style={{ width: `${recuperadasPct}%` }} />
          <div className="h-full bg-warning transition-[width] duration-700 ease-out" style={{ width: `${pendientesPct}%` }} />
          <div className="h-full bg-muted-foreground/30 transition-[width] duration-700 ease-out" style={{ width: `${sinReoperacionPct}%` }} />
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Legend dotClass="bg-success" text={`Recuperadas ${placasRecuperadas}`} />
          <Legend dotClass="bg-warning" text={`Pendientes ${service.placasPendientes}`} />
          <Legend dotClass="bg-muted-foreground/30" text={`Sin RO ${placasSinReoperacion}`} />
        </ul>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RO por proceso</p>
        <HorizontalBars
          items={service.procesos.map((p) => ({ label: p.proceso, value: p.total }))}
          emptyText="Sin reoperaciones registradas."
        />
      </div>
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warning' | 'success' }) {
  const toneClass = tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-primary';
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</dd>
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
