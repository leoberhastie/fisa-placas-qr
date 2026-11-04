import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

export const SPLASH_DURATION_MS = 6000;
export const SPLASH_SEEN_KEY = 'fisa-splash-seen';

export function LoadingScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(100, (elapsed / SPLASH_DURATION_MS) * 100));
    }, 40);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="loading-screen relative flex min-h-screen items-center justify-center overflow-hidden bg-primary px-6 text-primary-foreground">
      <div className="loading-orb loading-orb-one" />
      <div className="loading-orb loading-orb-two" />
      <section className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <div className="loading-logo-shell mb-8 flex h-36 w-36 items-center justify-center rounded-full bg-card/95 p-5 shadow-xl ring-4 ring-accent/20 sm:h-40 sm:w-40">
          <img
            src="/assets/logos/image%20copy%202.png"
            alt="FISA-PLACAS"
            className="h-full w-full object-contain"
          />
        </div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.34em] text-sidebar-primary">Intelligent Forms</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">FISA-PLACAS</h1>
        <p className="mt-2 text-lg font-medium text-primary-foreground/70">Reoperaciones</p>
        <div className="mt-10 flex items-center gap-2 text-sm text-primary-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin text-sidebar-primary" />
          Preparando tu espacio de trabajo
        </div>
        <div className="mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/15">
          <div className="loading-progress h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-10 rounded-2xl border border-accent/30 bg-white/10 px-6 py-4 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sidebar-primary">Creado por Calidad</p>
          <p className="mt-2 text-lg font-bold text-primary-foreground">Ing. Leober Reyes Hastie</p>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-primary-foreground/70">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>Control y trazabilidad de reoperaciones</span>
          </div>
        </div>
      </section>
    </main>
  );
}
