import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { LoadingScreen, SPLASH_DURATION_MS, SPLASH_SEEN_KEY } from '@/components/ui/LoadingScreen';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { PostLoginSetupModal } from '@/components/auth/PostLoginSetupModal';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { ToastProvider } from '@/context/ToastContext';
import { AppRouter } from '@/navigation/AppRouter';

function FullScreenStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <div className="flex flex-col items-center gap-4 text-center">{children}</div>
    </div>
  );
}

function App() {
  const { session, profile, profileError, loading, signOut } = useAuth();
  const { selectedProductionId, operatorName } = useProductionSelection();
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [minimumLoadingComplete, setMinimumLoadingComplete] = useState(
    () => window.sessionStorage.getItem(SPLASH_SEEN_KEY) === '1',
  );

  useEffect(() => {
    if (minimumLoadingComplete) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
      setMinimumLoadingComplete(true);
    }, SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [minimumLoadingComplete]);

  const needsSetup = !selectedProductionId || !operatorName;

  if (loading || !minimumLoadingComplete) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!profile) {
    return (
      <FullScreenStatus>
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="max-w-sm font-semibold text-foreground">
          {profileError ?? 'No se pudo cargar tu cuenta.'}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary"
        >
          Volver a iniciar sesión
        </button>
      </FullScreenStatus>
    );
  }

  return (
    <ToastProvider>
      <AppRouter profile={profile} />
      {needsSetup && !setupDismissed && (
        <PostLoginSetupModal
          userName={profile.full_name ?? profile.email}
          role={profile.role}
          onClose={() => setSetupDismissed(true)}
        />
      )}
    </ToastProvider>
  );
}

export default App;
