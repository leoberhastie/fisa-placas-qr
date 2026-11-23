import { supabase } from '@/lib/supabase';

export interface AuditoriaResumen {
  total_archivo: number;
  total_base_datos: number;
  en_archivo_no_bd: number;
  en_bd_no_archivo: number;
  coincidentes: number;
  servicio: string;
}

export interface AuditoriaDetalleItem {
  serie: string;
  posicion: string;
  estado: 'coincide' | 'solo_archivo' | 'solo_bd';
}

export interface AuditoriaComparacion {
  id: string;
  produccion_id: string;
  usuario: string;
  fecha: string;
  nombre_archivo: string;
  resumen: AuditoriaResumen;
  detalles: AuditoriaDetalleItem[];
  created_at: string;
}

export async function guardarComparacionAuditoria(
  produccionId: string,
  usuario: string,
  nombreArchivo: string,
  resumen: AuditoriaResumen,
  detalles: AuditoriaDetalleItem[],
): Promise<AuditoriaComparacion> {
  const { data, error } = await supabase
    .from('auditoria_comparaciones')
    .insert({
      produccion_id: produccionId,
      usuario,
      nombre_archivo: nombreArchivo,
      resumen,
      detalles,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AuditoriaComparacion;
}

export async function listarAuditoriaComparaciones(
  produccionId: string,
): Promise<AuditoriaComparacion[]> {
  const { data, error } = await supabase
    .from('auditoria_comparaciones')
    .select('*')
    .eq('produccion_id', produccionId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AuditoriaComparacion[];
}

export async function obtenerAuditoriaComparacion(
  id: string,
): Promise<AuditoriaComparacion | null> {
  const { data, error } = await supabase
    .from('auditoria_comparaciones')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as AuditoriaComparacion | null;
}
