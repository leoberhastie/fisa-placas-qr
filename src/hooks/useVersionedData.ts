import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataSyncActions } from '@/context/DataSyncContext';

interface VersionedState<T> {
  key: string | null;
  data: T | null;
  version: number | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE = { key: null, data: null, version: null, loading: false, error: null };

export function useVersionedData<T>(
  scope: string,
  produccionId: string | null,
  fetcher: (produccionId: string) => Promise<T>,
  fallbackError: string,
) {
  const { refreshVersions, readCache, writeCache } = useDataSyncActions();
  const key = produccionId ? `${scope}:${produccionId}` : null;
  const [state, setState] = useState<VersionedState<T>>(EMPTY_STATE);
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      const requestId = ++requestIdRef.current;
      if (!produccionId || !key) {
        setState(EMPTY_STATE);
        return;
      }

      if (!force) {
        const cached = readCache<T>(key);
        if (cached) {
          setState({ key, data: cached.value, version: cached.version, loading: false, error: null });
          return;
        }
      }

      setState((previous) => {
        const sameKey = previous.key === key;
        return {
          key,
          data: sameKey ? previous.data : null,
          version: sameKey ? previous.version : null,
          loading: true,
          error: null,
        };
      });

      try {
        const versions = await refreshVersions();
        const version = versions[produccionId] ?? 0;
        const value = await fetcher(produccionId);
        if (requestId !== requestIdRef.current) return;
        writeCache(key, version, value);
        setState({ key, data: value, version, loading: false, error: null });
      } catch (cause) {
        if (requestId !== requestIdRef.current) return;
        setState((previous) => ({
          ...previous,
          key,
          loading: false,
          error: cause instanceof Error ? cause.message : fallbackError,
        }));
      }
    },
    [produccionId, key, readCache, writeCache, refreshVersions, fetcher, fallbackError],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const current = state.key === key;
  return {
    data: current ? state.data : null,
    version: current ? state.version : null,
    loading: key !== null && (!current || state.loading),
    error: current ? state.error : null,
    reload: () => load(true),
  };
}
