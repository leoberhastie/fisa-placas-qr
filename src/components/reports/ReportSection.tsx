import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface ReportSectionProps {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function ReportSection({ title, description, actions, children }: ReportSectionProps) {
  const [open, setOpen] = useState(false);
  const contentId = `report-section-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <header className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={contentId}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block font-semibold text-primary transition-colors group-hover:text-accent">{title}</span>
            <span className="block text-sm leading-relaxed text-muted-foreground">{description}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      {open && (
        <div id={contentId} className="space-y-4 border-t border-border px-5 pb-5 pt-4">
          {children}
        </div>
      )}
    </section>
  );
}
