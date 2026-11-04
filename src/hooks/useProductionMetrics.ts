import { useVersionedData } from '@/hooks/useVersionedData';
import {
  fetchBoxMetrics,
  fetchProductionMetrics,
  fetchServiceMetrics,
  type BoxMetricRow,
  type ProductionMetrics,
  type ServiceMetricRow,
} from '@/services/metricsService';

interface ProductionDashboard {
  metrics: ProductionMetrics;
  services: ServiceMetricRow[];
  boxes: BoxMetricRow[];
}

const EMPTY_METRICS: ProductionMetrics = {
  totalPlacas: 0,
  placasAfectadas: 0,
  placasConPendientes: 0,
  porcentajePlacasAfectadas: 0,
  totalReoperaciones: 0,
  reoperacionesPendientes: 0,
  totalRecuperaciones: 0,
  porcentajeRecuperacion: 0,
  cajasConReoperaciones: 0,
  cajasPendientes: 0,
  cajasCompletas: 0,
  cajasEnProceso: 0,
  cajasCompletadasRo: 0,
  serviciosConReoperaciones: 0,
  serviciosPendientes: 0,
  serviciosEnProceso: 0,
  serviciosCompletos: 0,
};

async function fetchDashboard(produccionId: string): Promise<ProductionDashboard> {
  const [metrics, services, boxes] = await Promise.all([
    fetchProductionMetrics(produccionId),
    fetchServiceMetrics(produccionId),
    fetchBoxMetrics(produccionId),
  ]);
  return { metrics, services, boxes };
}

export function useProductionMetrics(produccionId: string | null) {
  const { data, version, loading, error, reload } = useVersionedData(
    'dashboard',
    produccionId,
    fetchDashboard,
    'No se pudieron cargar las métricas.',
  );

  return {
    metrics: data?.metrics ?? EMPTY_METRICS,
    services: data?.services ?? [],
    boxes: data?.boxes ?? [],
    loading,
    error,
    dataVersion: version,
    reload,
  };
}
