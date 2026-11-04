import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listHistorialByProduction,
  listPlacasByIds,
  listReoperacionesByProduction,
  listRecuperacionesByProduction,
} from '@/services/operationService';
import type { HistorialOperacion, Placa, Reoperation, Recuperacion } from '@/types/domain';

export function useHistoryData(produccionId: string | null) {
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
      const [reop, recup, hist] = await Promise.all([
        listReoperacionesByProduction(produccionId),
        listRecuperacionesByProduction(produccionId),
        listHistorialByProduction(produccionId),
      ]);
      const placaIds = Array.from(
        new Set([...reop, ...recup].map((r) => r.placa_id).filter((id): id is string => Boolean(id))),
      );
      const placasReferenciadas = await listPlacasByIds(produccionId, placaIds);
      if (requestId !== requestIdRef.current) return;
      setReoperaciones(reop);
      setRecuperaciones(recup);
      setHistorial(hist);
      setPlacas(placasReferenciadas);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [produccionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { placas, reoperaciones, recuperaciones, historial, loading, error, reload: load };
}
