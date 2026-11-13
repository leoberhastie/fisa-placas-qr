import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'reoperaciones.analyticsSelectedProductionIds';
const VERSION_KEY = 'reoperaciones.analyticsSelectionVersion';

interface AnalyticsSelectionValue {
  selectedIds: string[] | null;
  selectionVersion: number;
  setSelectedIds: (ids: string[]) => void;
  isResolved: boolean;
}

const AnalyticsSelectionContext = createContext<AnalyticsSelectionValue | undefined>(undefined);

function readStoredIds(): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

function readStoredVersion(): number {
  try {
    const raw = window.localStorage.getItem(VERSION_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function AnalyticsSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIdsState] = useState<string[] | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    const stored = readStoredIds();
    if (stored) {
      setSelectedIdsState(stored);
      setSelectionVersion(readStoredVersion());
    }
    setIsResolved(true);
  }, []);

  const setSelectedIds = useCallback((ids: string[]) => {
    setSelectedIdsState(ids);
    setSelectionVersion((v) => {
      const next = v + 1;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
        window.localStorage.setItem(VERSION_KEY, String(next));
      } catch {
        // Storage can be unavailable in private mode; the selection still applies for this session.
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ selectedIds, selectionVersion, setSelectedIds, isResolved }),
    [selectedIds, selectionVersion, setSelectedIds, isResolved],
  );

  return (
    <AnalyticsSelectionContext.Provider value={value}>{children}</AnalyticsSelectionContext.Provider>
  );
}

export function useAnalyticsSelection(): AnalyticsSelectionValue {
  const context = useContext(AnalyticsSelectionContext);
  if (!context) {
    throw new Error('useAnalyticsSelection debe usarse dentro de AnalyticsSelectionProvider.');
  }
  return context;
}
