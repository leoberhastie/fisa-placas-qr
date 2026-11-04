import { INCIDENT_STATUS_META, type IncidentStatus } from '@/types/domain';

const LEGEND_ORDER: IncidentStatus[] = ['pendiente', 'atencion', 'completo', 'sin_incidencias'];

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Significado de los estados">
      {LEGEND_ORDER.map((status) => {
        const meta = INCIDENT_STATUS_META[status];
        return (
          <li key={status} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
            {meta.label}
          </li>
        );
      })}
    </ul>
  );
}
