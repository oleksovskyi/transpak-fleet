// Клієнт для /api/platform/* — окремий рівень довіри від звичайного логіну користувача
// (JWT admin/viewer конкретної компанії): тут авторизація через платформний ключ
// (X-Platform-Key), призначений лише для онбордингу нових клієнтів платформи.
const PLATFORM_KEY_STORAGE = 'transpak_platform_key';

export function getPlatformKey(): string | null {
  return localStorage.getItem(PLATFORM_KEY_STORAGE);
}

export function setPlatformKey(key: string | null) {
  if (key) localStorage.setItem(PLATFORM_KEY_STORAGE, key);
  else localStorage.removeItem(PLATFORM_KEY_STORAGE);
}

export class PlatformApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function platformFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const key = getPlatformKey();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(key ? { 'X-Platform-Key': key } : {}),
    ...options.headers,
  };

  const res = await fetch(`/api/platform${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PlatformApiError(res.status, body.error ?? `Помилка запиту (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface PlatformCompany {
  id: string;
  name: string;
  createdAt: string;
}

export interface PlatformUser {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  companyId: string;
}

export interface WialonConfig {
  id: string;
  companyId: string;
  wialonToken: string;
  wialonBaseUrl: string | null;
  depotLat: number;
  depotLon: number;
  depotRadiusKm: number;
  depotName: string;
  wialonReportResourceId: number;
  wialonReportTemplateId: number;
  wialonDriversResourceId: number | null;
  enabled: boolean;
}
