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
    .select('id, consecutivo, estado, anio, version_datos, description')
    .eq('status', 'activa')
    .order('anio', { ascending: true })
    .order('consecutivo', { ascending: true });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar las producciones activas.');
  return data.map((row: { id: string; consecutivo: number; estado: string; anio: number; version_datos: number, description: string}) => ({
    id: row.id,
    label: productionDisplayLabel(row),
    versionDatos: row.version_datos,
  }));
}

export interface AnalyticsProductionOption {
  id: string;
  label: string;
  status: string;
  consecutivo: number;
  estado: string;
  anio: number;
  versionDatos: number;
  description: string;
}

export async function fetchAllProductionOptions(): Promise<AnalyticsProductionOption[]> {
  const { data, error } = await supabase
    .from('productions')
    .select('id, consecutivo, estado, anio, status, version_datos, description')
    .order('anio', { ascending: true })
    .order('consecutivo', { ascending: true });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar las producciones.');
  return data.map((row: { id: string; consecutivo: number; estado: string; anio: number; status: string; version_datos: number; description: string }) => ({
    id: row.id,
    label: productionDisplayLabel(row),
    status: row.status,
    consecutivo: row.consecutivo,
    estado: row.estado,
    anio: row.anio,
    versionDatos: row.version_datos,
    description: row.description,
  }));
}

export async function fetchProductionRefsByIds(ids: string[]): Promise<ActiveProductionRef[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('productions')
    .select('id, consecutivo, estado, anio, version_datos, description')
    .in('id', ids)
    .order('anio', { ascending: true })
    .order('consecutivo', { ascending: true });
  if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar las producciones seleccionadas.');
  return data.map((row: { id: string; consecutivo: number; estado: string; anio: number; version_datos: number; description: string }) => ({
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
