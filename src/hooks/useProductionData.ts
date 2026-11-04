import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listReoperacionesByProduction,
  listRecuperacionesByProduction,
  listHistorialByProduction,
  listPlacasByProduction,
} from '@/services/operationService';
import type { Placa, Reoperation, Recuperacion, HistorialOperacion } from '@/types/domain';

export function useProductionData(produccionId: string | null) {
  const [placas, setPlacas] = useState<Placa[]>([]);
  const [reoperaciones, setReoperaciones] = useState<Reoperation[]>([]);
  const [recuperaciones, setRecuperaciones] = useState<Recuperacion[]>([]);
  const [historial, setHistorial] = useState<HistorialOperacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!produccionId) {
      setPlacas([]);
      setReoperaciones([]);
      setRecuperaciones([]);
      setHistorial([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, r, rec, h] = await Promise.all([
        listPlacasByProduction(produccionId),
        listReoperacionesByProduction(produccionId),
        listRecuperacionesByProduction(produccionId),
        listHistorialByProduction(produccionId),
      ]);
      if (requestId !== requestIdRef.current) return;
      setPlacas(p);
      setReoperaciones(r);
      setRecuperaciones(rec);
      setHistorial(h);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [produccionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { placas, reoperaciones, recuperaciones, historial, loading, error, reload: load };
}
