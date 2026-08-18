import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { RouteLog } from '../types';

interface UseRouteLogsResult {
  routeLogs: RouteLog[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRouteLogs(): UseRouteLogsResult {
  const [routeLogs, setRouteLogs] = useState<RouteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<RouteLog[]>('/route-logs')
      .then((data) => {
        if (!cancelled) setRouteLogs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити маршрути');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { routeLogs, loading, error, refetch };
}
