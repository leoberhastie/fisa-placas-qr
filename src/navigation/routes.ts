import {
  ClipboardList,
  FileBarChart,
  Factory,
  Gauge,
  History,
  Layers,
  LayoutDashboard,
  Package,
  QrCode,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types/domain';

export interface AppRoute {
  path: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/ajustes', label: 'Ajustes', shortLabel: 'Ajustes', icon: Settings, roles: ['admin'] },
  { path: '/panel-admin', label: 'Panel de administrador', shortLabel: 'Admin', icon: LayoutDashboard, roles: ['admin'] },
  { path: '/lector-qr', label: 'Lector QR', shortLabel: 'QR', icon: QrCode, roles: ['admin', 'operador'] },
  { path: '/panel-control', label: 'Panel de control', shortLabel: 'Control', icon: Gauge, roles: ['admin', 'gerente'] },
  { path: '/produccion', label: 'Selección de producción', shortLabel: 'Producción', icon: Factory, roles: ['admin', 'operador', 'gerente'] },
  { path: '/reoperaciones', label: 'Reoperaciones generales', shortLabel: 'Reoperaciones', icon: ClipboardList, roles: ['admin', 'operador', 'gerente'] },
  { path: '/servicios', label: 'Servicios', shortLabel: 'Servicios', icon: Layers, roles: ['admin', 'gerente'] },
  { path: '/cajas', label: 'Cajas con reoperaciones', shortLabel: 'Cajas', icon: Package, roles: ['admin', 'operador', 'gerente'] },
  { path: '/historial', label: 'Historial', shortLabel: 'Historial', icon: History, roles: ['admin', 'operador', 'gerente'] },
  { path: '/reportes', label: 'Reportes', shortLabel: 'Reportes', icon: FileBarChart, roles: ['admin', 'gerente'] },
];

export const HOME_ROUTE_BY_ROLE: Record<UserRole, string> = {
  admin: '/ajustes',
  operador: '/lector-qr',
  gerente: '/panel-control',
};

export function getRoutesForRole(role: UserRole): AppRoute[] {
  return APP_ROUTES.filter((route) => route.roles.includes(role));
}
