import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { signInWithUsername } from '@/services/authService';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Escribe tu usuario y contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithUsername(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/50 lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--accent)/0.25),transparent_45%),radial-gradient(circle_at_80%_80%,hsl(var(--accent)/0.15),transparent_40%)]" />
        <div className="relative max-w-[220px] rounded-2xl bg-card px-4 py-3">
          <img src="/assets/logos/image%20copy.png" alt="Intelligent Forms" className="w-full object-contain" />
        </div>
        <p className="relative mt-4 text-sm font-semibold text-sidebar-primary">FISA-PLACAS Reoperaciones</p>
        <div className="relative max-w-md space-y-6">
          <h2 className="text-4xl font-semibold leading-tight text-primary-foreground">
            Trazabilidad completa de cada placa, desde la producción hasta la entrega.
          </h2>
          <p className="text-base leading-relaxed text-primary-foreground/70">
            Registra reoperaciones y recuperaciones por serie, caja, servicio y proceso, con información
            guardada en tiempo real para toda la planta.
          </p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-primary-foreground/70">
          <ShieldCheck className="h-4 w-4 text-sidebar-primary" />
          Acceso restringido al personal autorizado
        </div>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="w-48 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
              <img src="/assets/logos/image%20copy.png" alt="Intelligent Forms" className="w-full object-contain" />
            </div>
            <p className="mt-3 text-base font-semibold text-foreground">FISA-PLACAS Reoperaciones</p>
            <p className="mt-1 text-xs text-muted-foreground">Creado por Calidad · Ing. Leober Reyes Hastie</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6 space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">Iniciar sesión</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Ingresa con el usuario y la contraseña asignados a tu puesto.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label htmlFor="username" className="block text-sm font-medium text-foreground/80">
                  Usuario
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="Tu usuario"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-foreground/80">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card py-2.5 pl-3 pr-11 text-sm text-foreground placeholder-muted-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    placeholder="Tu contraseña"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-accent/90:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
