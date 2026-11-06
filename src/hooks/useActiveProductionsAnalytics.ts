import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataSyncActions, useProductionVersions } from '@/context/DataSyncContext';
import { aggregateActiveProductions, type ActiveAnalytics } from '@/lib/activeAnalytics';
import { fetchActiveProductionRefs, fetchActiveProductionSnapshots, type ActiveProductionRef } from '@/services/analyticsService';

interface AnalyticsState {
  data: ActiveAnalytics | null;
  loadedVersions: Record<string, number> | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: AnalyticsState = { data: null, loadedVersions: null, loading: true, error: null };

function cacheKeyFor(refs: ActiveProductionRef[]): string {
  return `analytics:activas:${refs.map((ref) => ref.id).sort().join(',')}`;
}

export function useActiveProductionsAnalytics() {
  const { readCache, writeCache } = useDataSyncActions();
  const liveVersions = useProductionVersions();
  const [state, setState] = useState<AnalyticsState>(INITIAL_STATE);
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      const requestId = ++requestIdRef.current;
      setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const refs = await fetchActiveProductionRefs();
        const loadedVersions = Object.fromEntries(refs.map((ref) => [ref.id, ref.versionDatos]));
        const version = refs.reduce((acc, ref) => acc + ref.versionDatos, 0);
        const key = cacheKeyFor(refs);

        const cached = force ? undefined : readCache<ActiveAnalytics>(key);
        if (cached && cached.version === version) {
          if (requestId === requestIdRef.current) {
            setState({ data: cached.value, loadedVersions, loading: false, error: null });
          }
          return;
        }

        const snapshots = await fetchActiveProductionSnapshots(refs);
        const analytics = aggregateActiveProductions(snapshots);
        if (requestId !== requestIdRef.current) return;
        writeCache(key, version, analytics);
        setState({ data: analytics, loadedVersions, loading: false, error: null });
      } catch (cause) {
        if (requestId !== requestIdRef.current) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: cause instanceof Error ? cause.message : 'No se pudo cargar el análisis.',
        }));
      }
    },
    [readCache, writeCache],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const hasNewData =
    state.loadedVersions !== null &&
    Object.entries(state.loadedVersions).some(([id, loaded]) => (liveVersions[id] ?? loaded) > loaded);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    hasNewData,
    reload: () => load(true),
  };
}
