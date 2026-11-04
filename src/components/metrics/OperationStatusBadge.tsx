import { CheckCircle2, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import type { MetricStatus } from '@/lib/metricsTypes';

export const BOX_STATUS_LABELS: Record<MetricStatus, string> = {
  en_proceso: 'EN PROCESO',
  con_reoperaciones: 'CON REOPERACIONES',
  completada: 'COMPLETADA',
  completada_ro: 'COMPLETADA RO',
};

export const BOX_ESTADO_FILTER_OPTIONS: { value: MetricStatus | 'todos'; label: string }[] = [
  { value: 'con_reoperaciones', label: 'Con reoperaciones pendientes' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'completada_ro', label: 'Completada RO' },
  { value: 'completada', label: 'Completada' },
  { value: 'todos', label: 'Todos los estados' },
];

export const SERVICE_STATUS_LABELS: Record<MetricStatus, string> = {
  en_proceso: 'EN PROCESO',
  con_reoperaciones: 'CON REOPERACIONES',
  completada: 'COMPLETADA',
  completada_ro: 'COMPLETADA RO',
};

const STATUS_STYLE: Record<MetricStatus, { className: string; Icon: typeof Clock }> = {
  con_reoperaciones: { className: 'bg-destructive/10 text-destructive ring-destructive/20', Icon: AlertTriangle },
  en_proceso: { className: 'bg-warning/10 text-warning ring-warning/20', Icon: Clock },
  completada: { className: 'bg-success/10 text-success ring-success/20', Icon: CheckCircle2 },
  completada_ro: { className: 'bg-accent/10 text-accent ring-accent/20', Icon: RotateCcw },
};

interface OperationStatusBadgeProps {
  status: MetricStatus;
  labels: Record<MetricStatus, string>;
}

export function OperationStatusBadge({ status, labels }: OperationStatusBadgeProps) {
  const { className, Icon } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
