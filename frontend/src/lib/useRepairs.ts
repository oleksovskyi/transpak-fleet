import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { Repair } from '../types';

interface UseRepairsResult {
  repairs: Repair[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRepairs(): UseRepairsResult {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Repair[]>('/repairs')
      .then((data) => {
        if (!cancelled) setRepairs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити ремонти');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { repairs, loading, error, refetch };
}
