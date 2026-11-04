import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/domain';

function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return 'Ya existe una cuenta con este correo.';
  }
  if (normalized.includes('password should be at least')) {
    return 'La contraseña es demasiado corta.';
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  }
  return 'No se pudo completar la operación. Intenta de nuevo.';
}

const STAFF_EMAIL_DOMAIN = 'reoperaciones.app';

export async function signInWithUsername(username: string, password: string): Promise<void> {
  const email = `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(translateAuthError(error.message));
  }
}

export async function changeCurrentPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error('No se pudo cambiar la contraseña. Intenta de nuevo.');
  }
}

export async function signOutCurrentUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error('No se pudo cerrar la sesión. Intenta de nuevo.');
  }
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw new Error('No se pudo cargar tu perfil. Intenta de nuevo.');
  }
  return data as Profile | null;
}
