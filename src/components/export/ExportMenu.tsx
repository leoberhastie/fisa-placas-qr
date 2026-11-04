import { FileSpreadsheet, FileText } from 'lucide-react';

interface ExportMenuProps {
  onExcel: () => void;
  onPdf: () => void;
  disabled?: boolean;
}

export function ExportMenu({ onExcel, onPdf, disabled = false }: ExportMenuProps) {
  const base =
    'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground/80 shadow-sm transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onExcel} disabled={disabled} className={base}>
        <FileSpreadsheet className="h-4 w-4 text-success" aria-hidden="true" />
        Excel
      </button>
      <button type="button" onClick={onPdf} disabled={disabled} className={base}>
        <FileText className="h-4 w-4 text-destructive" aria-hidden="true" />
        PDF
      </button>
    </div>
  );
}
