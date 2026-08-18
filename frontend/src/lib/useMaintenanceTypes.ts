import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { MaintenanceType } from '../types';

interface UseMaintenanceTypesResult {
  types: MaintenanceType[];
  loading: boolean;
  error: string | null;
}

export function useMaintenanceTypes(): UseMaintenanceTypesResult {
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MaintenanceType[]>('/maintenance-types')
      .then((data) => {
        if (!cancelled) setTypes(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити довідник ТО');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { types, loading, error };
}
