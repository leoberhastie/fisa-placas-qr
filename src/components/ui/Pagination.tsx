import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  summary?: string;
}

const BUTTON_CLASS =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-40';

export function Pagination({ page, totalPages, onPageChange, disabled = false, summary }: PaginationProps) {
  const controls = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={BUTTON_CLASS}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[4.5rem] text-center text-sm font-semibold text-primary tabular-nums">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={BUTTON_CLASS}
        aria-label="Página siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );

  if (!summary) return controls;

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-xs text-muted-foreground">{summary}</p>
      {controls}
    </div>
  );
}
