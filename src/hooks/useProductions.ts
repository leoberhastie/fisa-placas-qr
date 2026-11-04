import { useCallback, useEffect, useState } from 'react';
import {
  createProduction,
  listProductions,
  updateProduction,
  updateProductionStatus,
  type ProductionInput,
  type ProductionUpdateInput,
} from '@/services/productionService';
import type { Production, ProductionStatus } from '@/types/domain';

export function useProductions() {
  const [productions, setProductions] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProductions(await listProductions());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las producciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addProduction = useCallback(async (input: ProductionInput) => {
    const created = await createProduction(input);
    setProductions((current) => [created, ...current]);
    return created;
  }, []);

  const editProduction = useCallback(async (id: string, input: ProductionUpdateInput) => {
    const updated = await updateProduction(id, input);
    setProductions((current) => current.map((item) => (item.id === id ? updated : item)));
    return updated;
  }, []);

  const changeStatus = useCallback(async (id: string, status: ProductionStatus) => {
    const updated = await updateProductionStatus(id, status);
    setProductions((current) => current.map((item) => (item.id === id ? updated : item)));
    return updated;
  }, []);

  return { productions, loading, error, reload: load, addProduction, editProduction, changeStatus };
}
