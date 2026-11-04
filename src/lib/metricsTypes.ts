import type { ServiceType } from '@/types/domain';

export type MetricStatus =
  | 'en_proceso'
  | 'con_reoperaciones'
  | 'completada'
  | 'completada_ro';

export type { ServiceType };
