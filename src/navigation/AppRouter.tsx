import { useEffect, type ComponentType } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ProductionsPanel } from '@/components/productions/ProductionsPanel';
import { useHashPath } from '@/hooks/useHashPath';
import { AdminPanelPage } from '@/pages/AdminPanelPage';
import { BoxesPage } from '@/pages/BoxesPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { ManualPage } from '@/pages/ManualPage';
import { ManagerDashboardPage } from '@/pages/ManagerDashboardPage';
import { QrReaderPage } from '@/pages/QrReaderPage';
import { ReoperationsPage } from '@/pages/ReoperationsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { getRoutesForRole, HOME_ROUTE_BY_ROLE } from '@/navigation/routes';
import type { Profile } from '@/types/domain';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

const SCREEN_BY_PATH: Record<string, ComponentType<ScreenProps>> = {
  '/ajustes': SettingsPage,
  '/panel-admin': AdminPanelPage,
  '/lector-qr': QrReaderPage,
  '/panel-control': ManagerDashboardPage,
  '/produccion': ProductionsPanel,
  '/reoperaciones': ReoperationsPage,
  '/servicios': ServicesPage,
  '/cajas': BoxesPage,
  '/historial': HistoryPage,
  '/reportes': ReportsPage,
  '/manual': ManualPage,
};

interface AppRouterProps {
  profile: Profile;
}

export function AppRouter({ profile }: AppRouterProps) {
  const [path, navigate] = useHashPath();
  const routes = getRoutesForRole(profile.role);
  const homePath = HOME_ROUTE_BY_ROLE[profile.role];
  const isAllowed = path === '/produccion' || routes.some((route) => route.path === path);
  const activePath = isAllowed ? path : homePath;

  useEffect(() => {
    if (!isAllowed) navigate(homePath);
  }, [isAllowed, homePath, navigate]);

  const Screen = SCREEN_BY_PATH[activePath];
  const userName = profile.full_name || profile.email;

  if (!Screen) {
    return (
      <AppShell
        routes={routes}
        activePath={activePath}
        onNavigate={navigate}
        role={profile.role}
        userName={userName}
      >
        <section className="rounded-2xl border border-destructive/30 bg-card p-8 text-center">
          <h1 className="font-heading text-xl font-semibold text-foreground">Ruta no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">No se encontró una pantalla válida para tu perfil.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      routes={routes}
      activePath={activePath}
      onNavigate={navigate}
      role={profile.role}
      userName={userName}
    >
      <Screen onNavigate={navigate} />
    </AppShell>
  );
}
