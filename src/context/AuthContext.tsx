import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchProfile, signOutCurrentUser } from '@/services/authService';
import type { Profile } from '@/types/domain';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const applySession = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);

      if (!nextSession) {
        setProfile(null);
        setProfileError(null);
        setLoading(false);
        return;
      }

      try {
        const loaded = await fetchProfile(nextSession.user.id);
        if (!active) return;
        setProfile(loaded);
        setProfileError(loaded ? null : 'Tu cuenta no tiene perfil asignado. Contacta al administrador.');
      } catch (err) {
        if (!active) return;
        setProfile(null);
        setProfileError(err instanceof Error ? err.message : 'No se pudo cargar tu perfil.');
      } finally {
        if (active) setLoading(false);
      }
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION') return;
      (async () => {
        await applySession(nextSession);
      })();
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      return applySession(data.session);
    }).catch((err: unknown) => {
      if (!active) return;
      setProfileError(err instanceof Error ? err.message : 'No se pudo comprobar la sesión.');
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await signOutCurrentUser();
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, profileError, signOut }),
    [session, profile, loading, profileError, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.');
  }
  return context;
}
