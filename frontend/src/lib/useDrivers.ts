import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { Driver } from '../types';

interface UseDriversResult {
  drivers: Driver[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDrivers(): UseDriversResult {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Driver[]>('/drivers')
      .then((data) => {
        if (!cancelled) setDrivers(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити водіїв');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { drivers, loading, error, refetch };
}
