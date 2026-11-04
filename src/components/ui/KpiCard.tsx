import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: number | string | null;
  icon: LucideIcon;
  tone?: 'navy' | 'red' | 'emerald' | 'amber' | 'slate';
  hint?: string;
}

const TONE_CLASSES: Record<NonNullable<KpiCardProps['tone']>, string> = {
  navy: 'bg-primary/10 text-primary/80',
  red: 'bg-destructive/10 text-destructive',
  emerald: 'bg-success/10 text-success',
  amber: 'bg-warning/10 text-warning',
  slate: 'bg-muted text-muted-foreground',
};

export function KpiCard({ label, value, icon: Icon, tone = 'navy', hint }: KpiCardProps) {
  const hasValue = value !== null;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-primary">{hasValue ? value : '—'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint ?? (hasValue ? '' : 'Sin registros todavía')}</p>
    </div>
  );
}
