import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: number | string | null;
  icon: LucideIcon;
  tone?: 'navy' | 'red' | 'emerald' | 'amber' | 'slate';
  hint?: string;
  visible?: boolean;
}

const TONE_CLASSES: Record<NonNullable<KpiCardProps['tone']>, string> = {
  navy: 'bg-primary/10 text-primary/80',
  red: 'bg-destructive/10 text-destructive',
  emerald: 'bg-success/10 text-success',
  amber: 'bg-warning/10 text-warning',
  slate: 'bg-muted text-muted-foreground',
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'navy',
  hint,
  visible = true,
}: KpiCardProps) {

  if (!visible) return null;

  const hasValue = value !== null;

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs font-medium leading-snug text-muted-foreground sm:text-sm">
          {label}
        </p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${TONE_CLASSES[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-3 truncate text-2xl font-semibold tabular-nums leading-none text-primary sm:text-3xl">
        {hasValue ? value : '—'}
      </p>

      <p className="mt-2 text-xs leading-snug text-muted-foreground">
        {hint ?? (hasValue ? '' : 'Sin registros todavía')}
      </p>
    </div>
  );
}
