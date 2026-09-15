import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { MileageLog } from '../types';

interface UseMileageLogsResult {
  mileageLogs: MileageLog[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMileageLogs(): UseMileageLogsResult {
  const [mileageLogs, setMileageLogs] = useState<MileageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<MileageLog[]>('/mileage-logs')
      .then((data) => {
        if (!cancelled) setMileageLogs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити пробіг');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { mileageLogs, loading, error, refetch };
}
