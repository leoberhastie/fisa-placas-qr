import { supabase } from '@/lib/supabase';
import type { Production, ProductionStatus } from '@/types/domain';

const PRODUCTION_COLUMNS =
  'id, code, name, description, status, created_by, created_at, updated_at, consecutivo, estado, anio, fecha_ultima_importacion, version_datos';

export async function fetchProductionVersions(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('productions').select('id, version_datos');
  if (error || !Array.isArray(data)) throw new Error('No se pudo comprobar si hay datos nuevos.');
  return Object.fromEntries(data.map((row: { id: string; version_datos: number }) => [row.id, row.version_datos]));
}

export interface ProductionInput {
  code: string;
  name: string;
  description: string;
  consecutivo: number;
  estado: string;
  anio: number;
}

export interface ProductionUpdateInput {
  name?: string;
  description?: string;
  consecutivo?: number;
  estado?: string;
  anio?: number;
}

export async function listProductions(): Promise<Production[]> {
  const { data, error } = await supabase
    .from('productions')
    .select(PRODUCTION_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error('No se pudieron cargar las producciones.');
  }
  return (data ?? []) as Production[];
}

export async function createProduction(input: ProductionInput): Promise<Production> {
  const { data, error } = await supabase
    .from('productions')
    .insert({
      code: input.code.trim(),
      name: input.name.trim(),
      description: input.description.trim() || null,
      consecutivo: input.consecutivo,
      estado: input.estado.trim(),
      anio: input.anio,
    })
    .select(PRODUCTION_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe una producción con ese código.');
    }
    throw new Error('No se pudo guardar la producción.');
  }
  return data as Production;
}

export async function updateProduction(
  id: string,
  input: ProductionUpdateInput,
): Promise<Production> {
  const { data, error } = await supabase
    .from('productions')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(PRODUCTION_COLUMNS)
    .single();
  if (error) {
    throw new Error('No se pudo actualizar la producción.');
  }
  return data as Production;
}

export async function updateProductionStatus(
  id: string,
  status: ProductionStatus,
): Promise<Production> {
  const { data, error } = await supabase
    .from('productions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(PRODUCTION_COLUMNS)
    .single();
  if (error) {
    throw new Error('No se pudo actualizar el estado de la producción.');
  }
  return data as Production;
}

export async function resetProductionData(produccionId: string): Promise<void> {
  const { error } = await supabase.rpc('reset_production_data', { p_produccion_id: produccionId });
  if (error) throw new Error('No se pudieron reiniciar los datos de la producción.');
}
