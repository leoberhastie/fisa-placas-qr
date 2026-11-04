import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY_PRODUCTION = 'reoperaciones.selectedProductionId';
const STORAGE_KEY_OPERATOR = 'reoperaciones.operatorName';

interface ProductionSelectionValue {
  selectedProductionId: string | null;
  operatorName: string | null;
  selectProduction: (id: string | null) => void;
  setOperatorName: (name: string | null) => void;
}

const ProductionSelectionContext = createContext<ProductionSelectionValue | undefined>(undefined);

function readStoredProductionId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY_PRODUCTION);
  } catch {
    return null;
  }
}

function readStoredOperatorName(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY_OPERATOR);
  } catch {
    return null;
  }
}

export function ProductionSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedProductionId, setSelectedProductionId] = useState<string | null>(readStoredProductionId);
  const [operatorName, setOperatorNameState] = useState<string | null>(readStoredOperatorName);

  const selectProduction = useCallback((id: string | null) => {
    setSelectedProductionId(id);
    try {
      if (id) {
        window.localStorage.setItem(STORAGE_KEY_PRODUCTION, id);
      } else {
        window.localStorage.removeItem(STORAGE_KEY_PRODUCTION);
      }
    } catch {
      // Storage can be unavailable in private mode; the selection still applies for this session.
    }
  }, []);

  const setOperatorName = useCallback((name: string | null) => {
    setOperatorNameState(name);
    try {
      if (name) {
        window.localStorage.setItem(STORAGE_KEY_OPERATOR, name);
      } else {
        window.localStorage.removeItem(STORAGE_KEY_OPERATOR);
      }
    } catch {
      // Storage can be unavailable in private mode.
    }
  }, []);

  const value = useMemo(
    () => ({ selectedProductionId, operatorName, selectProduction, setOperatorName }),
    [selectedProductionId, operatorName, selectProduction, setOperatorName],
  );

  return (
    <ProductionSelectionContext.Provider value={value}>{children}</ProductionSelectionContext.Provider>
  );
}

export function useProductionSelection(): ProductionSelectionValue {
  const context = useContext(ProductionSelectionContext);
  if (!context) {
    throw new Error('useProductionSelection debe usarse dentro de ProductionSelectionProvider.');
  }
  return context;
}
