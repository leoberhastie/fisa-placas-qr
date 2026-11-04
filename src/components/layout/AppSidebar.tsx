import { ChevronDown, LogOut } from 'lucide-react';
import type { AppRoute } from '@/navigation/routes';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import { productionDisplayLabel, ROLE_LABELS, type UserRole } from '@/types/domain';

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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <SidebarPanel {...props} />
    </aside>
  );
}

export function SidebarPanel({ routes, activePath, onNavigate, userName, role, onSignOut, signingOut }: SidebarPanelProps) {
  const { selectedProductionId } = useProductionSelection();
  const { productions, loading } = useProductions();
  const selectedProduction = productions.find((production) => production.id === selectedProductionId) ?? null;
  const initials = userName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-5 pb-5 pt-7">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-card p-2 shadow-sm ring-1 ring-white/10">
            <img src="/assets/logos/image%20copy%202.png" alt="FISA-PLACAS" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-heading text-[21px] font-bold leading-none tracking-tight text-sidebar-foreground">FISA-PLACAS</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-sidebar-foreground/60">Reoperaciones</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNavigate('/produccion')}
        className="mx-5 shrink-0 rounded-2xl border border-white/20 bg-white/5 px-4 py-4 text-left transition-colors hover:bg-white/10"
        aria-label="Cambiar producción activa"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-foreground/60">Producción activa</p>
            {loading ? (
              <p className="mt-2 truncate text-lg font-bold text-sidebar-foreground/70">Cargando...</p>
            ) : selectedProduction ? (
              <>
                <p className="mt-2 truncate text-base font-bold tracking-tight text-sidebar-foreground">
                  {productionDisplayLabel(selectedProduction)}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-success/25 px-3 py-1 text-xs font-bold uppercase text-sidebar-primary">
                  {selectedProduction.status === 'activa' ? 'Activa' : selectedProduction.status}
                </span>
              </>
            ) : (
              <p className="mt-2 text-xs font-semibold text-sidebar-foreground/70">Seleccionar producción</p>
            )}
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-sidebar-foreground/70" aria-hidden="true" />
        </div>
      </button>

      <nav aria-label="Menú principal" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-6">
        {routes.map((route) => {
          const isActive = route.path === activePath;
          const Icon = route.icon;
          return (
            <button
              key={route.path}
              type="button"
              onClick={() => onNavigate(route.path)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors duration-200 ${
                isActive
                  ? 'bg-white/10 text-sidebar-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground'
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/80'}`} />
              <span className="truncate">{route.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 px-5 pb-6 pt-3">
        <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-sidebar-foreground">{userName}</p>
            <p className="truncate text-sm uppercase tracking-wide text-sidebar-primary">{ROLE_LABELS[role]}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-label="Cerrar sesión"
            className="rounded-lg p-2 text-sidebar-foreground/70 transition hover:bg-white/10 hover:text-sidebar-foreground disabled:opacity-50"
          >
            <LogOut className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-6 border-t border-white/15 pt-5 text-center">
          <p className="text-[8px] text-sidebar-foreground/10">Creado por Calidad</p>
          <p className="mt-1 text-[10px] text-sidebar-foreground/15">Ing. Leober Reyes Hastie</p>
        </div>
      </div>
    </div>
  );
}
