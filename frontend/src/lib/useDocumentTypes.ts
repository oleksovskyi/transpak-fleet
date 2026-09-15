import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { DocumentType } from '../types';

interface UseDocumentTypesResult {
  types: DocumentType[];
  loading: boolean;
  error: string | null;
}

export function useDocumentTypes(): UseDocumentTypesResult {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DocumentType[]>('/document-types')
      .then((data) => {
        if (!cancelled) setTypes(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити довідник документів');
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
