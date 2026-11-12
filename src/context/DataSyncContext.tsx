import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchProductionVersions } from '@/services/productionService';
import { useAuth } from '@/context/AuthContext';

const POLL_INTERVAL_MS = 30_000;

export type ProductionVersions = Record<string, number>;

interface CacheEntry {
  version: number;
  value: unknown;
}

interface DataSyncActions {
  refreshVersions: () => Promise<ProductionVersions>;
  readCache: <T>(key: string) => { version: number; value: T } | undefined;
  writeCache: <T>(key: string, version: number, value: T) => void;
}

const DataSyncActionsContext = createContext<DataSyncActions | undefined>(undefined);
const ProductionVersionsContext = createContext<ProductionVersions>({});

function sameVersions(a: ProductionVersions, b: ProductionVersions): boolean {
  const keys = Object.keys(b);
  return Object.keys(a).length === keys.length && keys.every((key) => a[key] === b[key]);
}

export function DataSyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [versions, setVersions] = useState<ProductionVersions>({});
  const cacheRef = useRef(new Map<string, CacheEntry>());

  const refreshVersions = useCallback(async () => {
    const next = await fetchProductionVersions();
    setVersions((current) => (sameVersions(current, next) ? current : next));
    return next;
  }, []);

  useEffect(() => {
    if (!session) return;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      refreshVersions().catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refreshVersions, session]);

  const actions = useMemo<DataSyncActions>(
    () => ({
      refreshVersions,
      readCache: <T,>(key: string) => {
        const entry = cacheRef.current.get(key);
        return entry ? { version: entry.version, value: entry.value as T } : undefined;
      },
      writeCache: <T,>(key: string, version: number, value: T) => {
        cacheRef.current.set(key, { version, value });
      },
    }),
    [refreshVersions],
  );

  return (
    <DataSyncActionsContext.Provider value={actions}>
      <ProductionVersionsContext.Provider value={versions}>{children}</ProductionVersionsContext.Provider>
    </DataSyncActionsContext.Provider>
  );
}

export function useDataSyncActions(): DataSyncActions {
  const context = useContext(DataSyncActionsContext);
  if (!context) {
    throw new Error('useDataSyncActions debe usarse dentro de DataSyncProvider.');
  }
  return context;
}

export function useProductionVersions(): ProductionVersions {
  return useContext(ProductionVersionsContext);
}
