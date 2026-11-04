import { INCIDENT_STATUS_META, type IncidentStatus } from '@/types/domain';

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const meta = INCIDENT_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}
