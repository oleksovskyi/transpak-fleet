import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { Truck } from '../types';

interface UseTrucksResult {
  trucks: Truck[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTrucks(): UseTrucksResult {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Truck[]>('/trucks')
      .then((data) => {
        if (!cancelled) setTrucks(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити ТЗ');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { trucks, loading, error, refetch };
}
