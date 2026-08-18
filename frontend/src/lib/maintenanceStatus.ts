import { MaintenanceType, Truck, TruckStatus } from '../types';

// Спільна форма для реальної TruckMaintenanceStatus і для "віртуальної" позиції —
// коли для пари (ТЗ, вид робіт) ще жодного разу не виконували роботи, і рядка
// TruckMaintenanceStatus в БД просто не існує.
export interface MaintenanceItemLike {
  maintenanceTypeId: string;
  maintenanceType: MaintenanceType;
  lastDoneAtKm: number | null;
  lastDoneAtDate: string | null;
}

// Повний перелік позицій регламенту для ТЗ: довідник видів робіт, змерджений із реальними
// TruckMaintenanceStatus. Види без жодного виконання потрапляють як "unknown", а не зникають.
export function buildMaintenanceItems(truck: Truck, allTypes: MaintenanceType[]): MaintenanceItemLike[] {
  return allTypes.map((type) => {
    const existing = truck.maintenanceStatuses.find((s) => s.maintenanceTypeId === type.id);
    return existing ?? { maintenanceTypeId: type.id, maintenanceType: type, lastDoneAtKm: null, lastDoneAtDate: null };
  });
}

export type ItemStatus = 'unknown' | 'ok' | 'soon' | 'overdue';

const RANK: Record<ItemStatus, number> = { unknown: -1, ok: 0, soon: 1, overdue: 2 };
export const statusRank = (s: ItemStatus) => RANK[s];

export const fmt = (n: number) => new Intl.NumberFormat('uk-UA').format(Math.round(n));

export const TRUCK_STATUS_LABEL: Record<TruckStatus, string> = {
  trip: 'В рейсі',
  free: 'На базі',
  service: 'На ТО',
  repair: 'В ремонті',
};

export const TRUCK_STATUS_BADGE: Record<TruckStatus, string> = {
  trip: 'badge-blue',
  free: 'badge-green',
  service: 'badge-amber',
  repair: 'badge-red',
};

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

interface EffectiveParams {
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  soonKm: number;
  soonDays: number;
  isOverridden: boolean;
  allowOverride: boolean;
}

/* Ефективні параметри позиції: беремо виняток по ТЗ, якщо він заданий, інакше — довідник */
export function effectiveParams(status: MaintenanceItemLike, truck: Truck): EffectiveParams {
  const type = status.maintenanceType;
  const override = truck.overrides.find((o) => o.maintenanceTypeId === status.maintenanceTypeId);
  return {
    name: type.name,
    intervalKm: override?.overrideIntervalKm ?? type.intervalKm,
    intervalDays: override?.overrideIntervalDays ?? type.intervalDays,
    soonKm: type.soonKm,
    soonDays: type.soonDays,
    isOverridden: !!override,
    allowOverride: type.allowOverride,
  };
}

function remaining(status: MaintenanceItemLike, truck: Truck) {
  const p = effectiveParams(status, truck);
  const remKm =
    p.intervalKm != null && status.lastDoneAtKm != null
      ? p.intervalKm - (truck.totalMileageKm - status.lastDoneAtKm)
      : null;
  const remDays =
    p.intervalDays != null && status.lastDoneAtDate != null
      ? p.intervalDays - daysSince(status.lastDoneAtDate)
      : null;
  return { p, remKm, remDays };
}

/* Статус однієї позиції регламенту. "unknown" — коли ще немає даних про останнє виконання
   (ані пробігу, ані дати), а не помилкове "прострочено". */
export function itemStatus(status: MaintenanceItemLike, truck: Truck): ItemStatus {
  const { p, remKm, remDays } = remaining(status, truck);
  if (remKm == null && remDays == null) return 'unknown';
  if ((remKm != null && remKm < 0) || (remDays != null && remDays < 0)) return 'overdue';
  if ((remKm != null && remKm <= p.soonKm) || (remDays != null && remDays <= p.soonDays)) return 'soon';
  return 'ok';
}

// Частка інтервалу, що вже "з'їдена" (0–100), для прогрес-бару. null — коли даних немає
// (unknown-позиція). Якщо відомі і км, і дні — беремо гірший (більший) прогрес.
export function itemProgressPercent(status: MaintenanceItemLike, truck: Truck): number | null {
  const { p, remKm, remDays } = remaining(status, truck);
  const pctKm = remKm != null && p.intervalKm ? ((p.intervalKm - remKm) / p.intervalKm) * 100 : null;
  const pctDays = remDays != null && p.intervalDays ? ((p.intervalDays - remDays) / p.intervalDays) * 100 : null;
  if (pctKm == null && pctDays == null) return null;
  const pct = Math.max(pctKm ?? -Infinity, pctDays ?? -Infinity);
  return Math.min(100, Math.max(0, pct));
}

export function itemRemainingLabel(status: MaintenanceItemLike, truck: Truck): string {
  const { remKm, remDays } = remaining(status, truck);
  const parts: string[] = [];
  if (remKm != null) parts.push(remKm < 0 ? `${fmt(Math.abs(remKm))} км понад` : `${fmt(remKm)} км`);
  if (remDays != null) parts.push(remDays < 0 ? `${Math.abs(remDays)} дн. понад` : `${remDays} дн.`);
  return parts.join(' · ') || 'ще не виконувалось';
}

/* Статус ТЗ загалом = найгірший статус серед позицій регламенту з відомими даними.
   Якщо даних немає взагалі — "unknown", а не "ok" (щоб не приховувати відсутність довідника). */
export function truckStatus(truck: Truck): ItemStatus {
  const known = truck.maintenanceStatuses.map((s) => itemStatus(s, truck)).filter((s) => s !== 'unknown');
  if (known.length === 0) return 'unknown';
  return known.reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'ok' as ItemStatus);
}

/* Позиція регламенту, найближча до дедлайну — саме її показуємо як "причину" статусу ТЗ */
export function truckMostUrgentItem(truck: Truck): MaintenanceItemLike | null {
  if (truck.maintenanceStatuses.length === 0) return null;
  return truck.maintenanceStatuses
    .slice()
    .sort((a, b) => {
      const rankDiff = RANK[itemStatus(b, truck)] - RANK[itemStatus(a, truck)];
      if (rankDiff !== 0) return rankDiff;
      const { remKm: remA, remDays: remDaysA } = remaining(a, truck);
      const { remKm: remB, remDays: remDaysB } = remaining(b, truck);
      const scoreA = remA ?? (remDaysA != null ? remDaysA * 300 : Infinity);
      const scoreB = remB ?? (remDaysB != null ? remDaysB * 300 : Infinity);
      return scoreA - scoreB;
    })[0];
}
