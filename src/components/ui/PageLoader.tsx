import { AlertCircle, Loader2, RotateCw } from 'lucide-react';

interface PageLoaderProps {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  hasData?: boolean;
  children: React.ReactNode;
}

export function PageLoader({ loading, error, onRetry, hasData = true, children }: PageLoaderProps) {
  const showLoading = loading && !hasData && !error;
  const showError = !!error && !hasData;

  if (showLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-border bg-card px-6 py-16 text-center shadow-sm">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/40 ring-4 ring-accent/10">
          <img src="/assets/logos/image%20copy%202.png" alt="" className="h-12 w-12 object-contain opacity-80" />
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Cargando...
        </div>
      </div>
    );
  }

  if (showError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-destructive/20 bg-card px-6 py-16 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <p className="max-w-sm text-sm font-medium text-primary">No se pudo cargar la información</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <RotateCw className="h-4 w-4" />
            Recargar
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
