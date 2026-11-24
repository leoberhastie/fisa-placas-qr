import {
  BookOpen,
  ClipboardList,
  ClipboardCheck,
  FileBarChart,
  Gauge,
  Globe,
  History,
  Layers,
  LayoutDashboard,
  Package,
  QrCode,
  Settings,
  CheckCircle2,
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
  { path: '/completado', label: 'Completado QR', shortLabel: 'Completado', icon: CheckCircle2, roles: ['admin', 'operador', 'filtro'] },
  { path: '/lector-qr', label: 'Lector QR', shortLabel: 'QR', icon: QrCode, roles: ['admin', 'operador'] },
  { path: '/panel-control', label: 'Panel de control', shortLabel: 'Control', icon: Gauge, roles: ['admin', 'gerente'] },
  { path: '/reoperaciones', label: 'Reoperaciones generales', shortLabel: 'Reoperaciones', icon: ClipboardList, roles: ['admin', 'operador', 'gerente', 'filtro'] },
  { path: '/servicios', label: 'Servicios', shortLabel: 'Servicios', icon: Layers, roles: ['admin', 'gerente'] },
  { path: '/cajas', label: 'Cajas con reoperaciones', shortLabel: 'Cajas', icon: Package, roles: ['admin', 'operador', 'gerente', 'filtro'] },
  { path: '/historial', label: 'Historial', shortLabel: 'Historial', icon: History, roles: ['admin', 'operador', 'gerente', 'filtro'] },
  { path: '/reportes', label: 'Reportes', shortLabel: 'Reportes', icon: FileBarChart, roles: ['admin', 'gerente'] },
  { path: '/analisis-global', label: 'Análisis global', shortLabel: 'Global', icon: Globe, roles: ['admin', 'gerente'] },
  { path: '/manual', label: 'Manual de usuario', shortLabel: 'Manual', icon: BookOpen, roles: ['admin', 'operador', 'gerente', 'filtro'] },
  { path: '/auditoria', label: 'Auditoría de reoperaciones', shortLabel: 'Auditoría', icon: ClipboardCheck, roles: ['admin', 'gerente'] },
];

export const HOME_ROUTE_BY_ROLE: Record<UserRole, string> = {
  admin: '/ajustes',
  operador: '/completado',
  gerente: '/panel-control',
  filtro: '/completado',
};

export function getRoutesForRole(role: UserRole): AppRoute[] {
  return APP_ROUTES.filter((route) => route.roles.includes(role));
}
