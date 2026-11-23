import { supabase } from '@/lib/supabase';

export interface MarcarPlacaResult {
  ya_completada: boolean;
  fecha_completado: string;
  serie: string;
  posicion: string;
  servicio: string;
  numero_caja: string;
  caja_completada_automatico?: boolean;
  total_placas_caja?: number;
  completadas_caja?: number;
  error?: string;
}

export interface AvanceProduccion {
  total_placas: number;
  placas_completadas: number;
  placas_pendientes: number;
  porcentaje_completado: number;
  servicios: AvanceServicio[];
  cajas: AvanceCaja[];
}

export interface AvanceServicio {
  servicio: string;
  total_placas: number;
  completadas: number;
  pendientes: number;
  porcentaje: number;
}

export interface AvanceCaja {
  servicio: string;
  numero_caja: string;
  total_placas: number;
  completadas: number;
  todas_completadas: boolean;
}

export interface AvanceCajaDetalle {
  total_placas: number;
  placas_completadas: number;
  todas_completadas: boolean;
  placas: PlacaAvance[];
}

export interface PlacaAvance {
  placa_id: string;
  serie: string;
  posicion: string;
  consecutivo: number;
  completada: boolean;
  fecha_completado: string | null;
}

export async function marcarPlacaCompletada(
  produccionId: string,
  placaId: string,
  operador: string,
  usuario: string,
): Promise<MarcarPlacaResult> {
  const { data, error } = await supabase.rpc('marcar_placa_completada', {
    p_produccion_id: produccionId,
    p_placa_id: placaId,
    p_operador: operador,
    p_usuario: usuario,
  });
  if (error) throw error;
  return data as MarcarPlacaResult;
}

export async function obtenerAvanceProduccion(produccionId: string): Promise<AvanceProduccion> {
  const { data, error } = await supabase.rpc('obtener_avance_produccion', {
    p_produccion_id: produccionId,
  });
  if (error) throw error;
  return data as AvanceProduccion;
}

export async function obtenerAvanceCaja(
  produccionId: string,
  servicio: string,
  numeroCaja: string,
): Promise<AvanceCajaDetalle> {
  const { data, error } = await supabase.rpc('obtener_avance_caja', {
    p_produccion_id: produccionId,
    p_servicio: servicio,
    p_numero_caja: numeroCaja,
  });
  if (error) throw error;
  return data as AvanceCajaDetalle;
}

export async function obtenerConteoCaja(
  produccionId: string,
  servicio: string,
  numeroCaja: string,
): Promise<{ total_placas: number; placas_completadas: number; todas_completadas: boolean }> {
  const { data, error } = await supabase.rpc('contar_placas_completadas_caja', {
    p_produccion_id: produccionId,
    p_servicio: servicio,
    p_numero_caja: numeroCaja,
  });
  if (error) throw error;
  return data as { total_placas: number; placas_completadas: number; todas_completadas: boolean };
}
