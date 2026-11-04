import { useCallback, useState, type ReactNode } from 'react';
import { AlertCircle, Menu } from 'lucide-react';
import { AppSidebar, SidebarPanel } from '@/components/layout/AppSidebar';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthContext';
import type { AppRoute } from '@/navigation/routes';
import type { UserRole } from '@/types/domain';

interface AppShellProps {
  routes: AppRoute[];
  activePath: string;
  onNavigate: (path: string) => void;
  role: UserRole;
  userName: string;
  children: ReactNode;
}

export function AppShell({ routes, activePath, onNavigate, role, userName, children }: AppShellProps) {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeRoute = routes.find((route) => route.path === activePath);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la sesión.');
      setSigningOut(false);
    }
  };

  const navigateFromMenu = (path: string) => {
    setMenuOpen(false);
    onNavigate(path);
  };

  const signOutFromMenu = () => {
    setMenuOpen(false);
    void handleSignOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        routes={routes}
        activePath={activePath}
        onNavigate={onNavigate}
        userName={userName}
        role={role}
        onSignOut={() => void handleSignOut()}
        signingOut={signingOut}
      />

      <Sheet open={menuOpen} title="Menú" onClose={closeMenu}>
        <SidebarPanel
          routes={routes}
          activePath={activePath}
          onNavigate={navigateFromMenu}
          userName={userName}
          role={role}
          onSignOut={signOutFromMenu}
          signingOut={signingOut}
        />
      </Sheet>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground/80 transition hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold text-primary">{activeRoute?.label ?? 'Operación'}</p>
          <p className="truncate text-[11px] text-muted-foreground">FISA-PLACAS Reoperaciones</p>
        </div>
      </header>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 hidden h-16 items-center border-b border-border bg-card/95 px-8 backdrop-blur lg:flex">
          <p className="font-heading text-base font-semibold text-primary">{activeRoute?.label ?? 'Operación'}</p>
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {error && (
            <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
