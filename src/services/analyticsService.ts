import { supabase } from '@/lib/supabase';
import type { ProductionSnapshot } from '@/lib/activeAnalytics';
import { fetchProductionMetrics, fetchReportData } from '@/services/metricsService';
import { productionDisplayLabel } from '@/types/domain';

export interface ActiveProductionRef {
  id: string;
  label: string;
  versionDatos: number;
}

export async function fetchActiveProductionRefs(): Promise<ActiveProductionRef[]> {
  const { data, error } = await supabase
    .from('productions')
    .select('id, consecutivo, estado, anio, version_datos')
    .eq('status', 'activa')
    .order('anio', { ascending: true })
    .order('consecutivo', { ascending: true });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar las producciones activas.');
  return data.map((row: { id: string; consecutivo: number; estado: string; anio: number; version_datos: number }) => ({
    id: row.id,
    label: productionDisplayLabel(row),
    versionDatos: row.version_datos,
  }));
}

export async function fetchActiveProductionSnapshots(refs: ActiveProductionRef[]): Promise<ProductionSnapshot[]> {
  return Promise.all(
    refs.map(async (ref) => {
      const [metrics, report] = await Promise.all([fetchProductionMetrics(ref.id), fetchReportData(ref.id)]);
      return { produccion: ref.label, metrics, report };
    }),
  );
}
