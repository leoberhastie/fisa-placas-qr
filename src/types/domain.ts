export type UserRole = 'admin' | 'operador' | 'gerente';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

export type ProductionStatus = 'activa' | 'finalizada' | 'archivada';

export interface Production {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProductionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  consecutivo: number;
  estado: string;
  anio: number;
  fecha_ultima_importacion: string | null;
  version_datos: number;
}

export function productionDisplayLabel(p: Pick<Production, 'consecutivo' | 'estado' | 'anio'>): string {
  return `${p.consecutivo}-${p.estado}-${p.anio}`;
}

export function productionDisplayCode(p: Pick<Production, 'code' | 'consecutivo' | 'estado' | 'anio'>): string {
  return `${p.consecutivo}-${p.estado}-${p.anio}`;
}

export type PlatePosition = 'FRONTAL' | 'TRASERA';

export type ServiceType = 'PZ' | 'JGS';

export interface Placa {
  id: string;
  produccion_id: string;
  consecutivo: number;
  serie: string;
  posicion: PlatePosition;
  servicio: string;
  numero_caja: string;
  fecha_importacion: string;
  activo: boolean;
}

export function placaLabel(placa: Pick<Placa, 'serie' | 'posicion'>): string {
  const suffix = placa.posicion === 'FRONTAL' ? 'F' : 'T';
  return `${placa.serie}-${suffix}`;
}

export type ReoperationProcess = 'Impresion' | 'Sticker' | 'Brotech' | 'Blanking' | 'Embossing';

export const REOPERATION_PROCESSES: ReoperationProcess[] = [
  'Impresion',
  'Sticker',
  'Brotech',
  'Blanking',
  'Embossing',
];

export type IncidentStatus = 'pendiente' | 'completo' | 'atencion' | 'sin_incidencias';

export interface Reoperation {
  id: string;
  produccion_id: string;
  placa_id: string | null;
  proceso: string;
  fecha_hora: string;
  operador: string;
  usuario: string;
  estado: IncidentStatus;
  observaciones: string;
}

export interface Recuperacion {
  id: string;
  produccion_id: string;
  placa_id: string | null;
  fecha_hora: string;
  operador: string;
  usuario: string;
  tipo_recuperacion: string;
  observaciones: string;
  es_manual: boolean;
}

export type HistorialTipoOperacion =
  | 'reoperacion'
  | 'recuperacion'
  | 'importacion'
  | 'cambio_estado'
  | 'edicion_placa';

export interface HistorialOperacion {
  id: string;
  produccion_id: string;
  placa_id: string | null;
  tipo_operacion: HistorialTipoOperacion;
  proceso: string;
  fecha_hora: string;
  operador: string;
  usuario: string;
  estado_anterior: string;
  estado_nuevo: string;
  observaciones: string;
}

export type ImportacionEstado = 'pendiente' | 'completada' | 'con_errores' | 'fallida';

export interface Importacion {
  id: string;
  produccion_id: string;
  nombre_archivo: string;
  fecha_importacion: string;
  usuario: string;
  cantidad_registros: number;
  cantidad_nuevos: number;
  cantidad_actualizados: number;
  cantidad_errores: number;
  estado_importacion: ImportacionEstado;
  version_datos: number;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  gerente: 'Gerente',
};

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  activa: 'Activa',
  finalizada: 'Finalizada',
  archivada: 'Archivada',
};

export const INCIDENT_STATUS_META: Record<
  IncidentStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  pendiente: {
    label: 'Pendiente',
    badgeClass: 'bg-destructive/10 text-destructive ring-destructive/20',
    dotClass: 'bg-destructive',
  },
  completo: {
    label: 'Completo / recuperado',
    badgeClass: 'bg-success/10 text-success ring-success/20',
    dotClass: 'bg-success',
  },
  atencion: {
    label: 'Requiere atención',
    badgeClass: 'bg-warning/10 text-warning ring-warning/20',
    dotClass: 'bg-warning',
  },
  sin_incidencias: {
    label: 'Sin incidencias',
    badgeClass: 'bg-muted text-muted-foreground ring-muted-foreground/20',
    dotClass: 'bg-muted-foreground/60',
  },
};

export function canManageProductions(role: UserRole): boolean {
  return role === 'admin';
}

export function canImportExcel(role: UserRole): boolean {
  return role === 'admin';
}

export function canRegisterOperations(role: UserRole): boolean {
  return role === 'admin' || role === 'operador';
}
