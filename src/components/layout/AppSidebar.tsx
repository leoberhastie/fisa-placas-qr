import { LogOut } from 'lucide-react';
import type { AppRoute } from '@/navigation/routes';
import { ROLE_LABELS, type UserRole } from '@/types/domain';

interface SidebarPanelProps {
  routes: AppRoute[];
  activePath: string;
  onNavigate: (path: string) => void;
  userName: string;
  role: UserRole;
  onSignOut: () => void;
  signingOut: boolean;
}

export function AppSidebar(props: SidebarPanelProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <SidebarPanel {...props} />
    </aside>
  );
}

export function SidebarPanel({ routes, activePath, onNavigate, userName, role, onSignOut, signingOut }: SidebarPanelProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-sidebar-border px-5 py-6">
        <div className="rounded-xl bg-card px-3 py-2.5 shadow-sm">
          <img src="/assets/logos/image%20copy.png" alt="Intelligent Forms" className="w-full object-contain" />
        </div>
        <div className="mt-4">
          <p className="font-heading text-sm font-semibold leading-tight">FISA-PLACAS Reoperaciones</p>
          <p className="mt-1 text-xs text-sidebar-foreground/60">Creado por Calidad · Ing. Leober Reyes Hastie</p>
        </div>
      </div>

      <nav aria-label="Menú principal" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {routes.map((route) => {
          const isActive = route.path === activePath;
          const Icon = route.icon;
          return (
            <button
              key={route.path}
              type="button"
              onClick={() => onNavigate(route.path)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? 'bg-white/15 text-sidebar-foreground shadow-inner'
                  : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground'
              }`}
            >
              {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-sidebar-primary" />}
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-sidebar-primary' : ''}`} />
              <span className="truncate">{route.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div className="flex min-w-0 items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold text-sidebar-primary">
            {userName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs text-sidebar-primary">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition hover:bg-white/10 hover:text-sidebar-foreground disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
        <p className="text-center text-[10px] text-sidebar-foreground/40">Intelligent Forms</p>
      </div>
    </div>
  );
}
