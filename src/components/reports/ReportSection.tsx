import type { ReactNode } from 'react';

interface ReportSectionProps {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function ReportSection({ title, description, actions, children }: ReportSectionProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-semibold text-primary">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
