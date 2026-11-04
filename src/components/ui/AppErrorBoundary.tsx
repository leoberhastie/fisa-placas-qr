import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('Error al renderizar la aplicación:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
        <section role="alert" className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div className="space-y-2">
            <h1 className="font-heading text-xl font-semibold text-foreground">No se pudo mostrar esta pantalla</h1>
            <p className="text-sm text-muted-foreground">Actualiza la página para volver a cargar el espacio de trabajo.</p>
            {this.state.message && <p className="text-xs text-destructive/80">{this.state.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Recargar página
          </button>
        </section>
      </main>
    );
  }
}
