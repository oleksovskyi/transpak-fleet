import { DocumentType, Truck } from '../types';

// Спільна форма для реальної TruckDocumentStatus і для "віртуальної" позиції — коли для
// пари (ТЗ, вид документа) ще жодного разу не оформлювали/продовжували, і рядка
// TruckDocumentStatus в БД просто не існує.
export interface DocumentItemLike {
  documentTypeId: string;
  documentType: DocumentType;
  lastIssuedAtDate: string | null;
}

// Повний перелік документів для ТЗ: довідник видів, змерджений із реальними
// TruckDocumentStatus. Види без жодного оформлення потрапляють як "unknown", а не зникають.
export function buildDocumentItems(truck: Truck, allTypes: DocumentType[]): DocumentItemLike[] {
  return allTypes.map((type) => {
    const existing = truck.documentStatuses.find((s) => s.documentTypeId === type.id);
    return existing ?? { documentTypeId: type.id, documentType: type, lastIssuedAtDate: null };
  });
}

export type DocumentItemStatus = 'unknown' | 'ok' | 'soon' | 'overdue';

const RANK: Record<DocumentItemStatus, number> = { unknown: -1, ok: 0, soon: 1, overdue: 2 };
export const documentStatusRank = (s: DocumentItemStatus) => RANK[s];

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

interface EffectiveDocumentParams {
  name: string;
  intervalDays: number;
  soonDays: number;
  isOverridden: boolean;
  allowOverride: boolean;
}

/* Ефективні параметри документа: беремо виняток по ТЗ, якщо він заданий, інакше — довідник */
export function effectiveDocumentParams(status: DocumentItemLike, truck: Truck): EffectiveDocumentParams {
  const type = status.documentType;
  const override = truck.documentOverrides.find((o) => o.documentTypeId === status.documentTypeId);
  return {
    name: type.name,
    intervalDays: override?.overrideIntervalDays ?? type.intervalDays,
    soonDays: type.soonDays,
    isOverridden: !!override,
    allowOverride: type.allowOverride,
  };
}

function remainingDays(status: DocumentItemLike, truck: Truck) {
  const p = effectiveDocumentParams(status, truck);
  const remDays = status.lastIssuedAtDate != null ? p.intervalDays - daysSince(status.lastIssuedAtDate) : null;
  return { p, remDays };
}

/* Статус одного документа. "unknown" — коли ще немає даних про останнє оформлення,
   а не помилкове "прострочено". */
export function documentItemStatus(status: DocumentItemLike, truck: Truck): DocumentItemStatus {
  const { p, remDays } = remainingDays(status, truck);
  if (remDays == null) return 'unknown';
  if (remDays < 0) return 'overdue';
  if (remDays <= p.soonDays) return 'soon';
  return 'ok';
}

// Частка терміну дії, що вже "з'їдена" (0–100), для прогрес-бару. null — коли даних немає.
export function documentItemProgressPercent(status: DocumentItemLike, truck: Truck): number | null {
  const { p, remDays } = remainingDays(status, truck);
  if (remDays == null || !p.intervalDays) return null;
  const pct = ((p.intervalDays - remDays) / p.intervalDays) * 100;
  return Math.min(100, Math.max(0, pct));
}

export function documentItemRemainingLabel(status: DocumentItemLike, truck: Truck): string {
  const { remDays } = remainingDays(status, truck);
  if (remDays == null) return 'ще не оформлювався';
  return remDays < 0 ? `${Math.abs(remDays)} дн. понад` : `${remDays} дн.`;
}

/* Статус ТЗ загалом = найгірший статус серед документів з відомими даними.
   Якщо даних немає взагалі — "unknown", а не "ok" (щоб не приховувати відсутність довідника). */
export function truckDocumentStatus(truck: Truck): DocumentItemStatus {
  const known = truck.documentStatuses.map((s) => documentItemStatus(s, truck)).filter((s) => s !== 'unknown');
  if (known.length === 0) return 'unknown';
  return known.reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'ok' as DocumentItemStatus);
}

/* Документ, найближчий до дедлайну — саме його показуємо як "причину" статусу ТЗ */
export function truckMostUrgentDocument(truck: Truck): DocumentItemLike | null {
  if (truck.documentStatuses.length === 0) return null;
  return truck.documentStatuses
    .slice()
    .sort((a, b) => {
      const rankDiff = RANK[documentItemStatus(b, truck)] - RANK[documentItemStatus(a, truck)];
      if (rankDiff !== 0) return rankDiff;
      const { remDays: remA } = remainingDays(a, truck);
      const { remDays: remB } = remainingDays(b, truck);
      return (remA ?? Infinity) - (remB ?? Infinity);
    })[0];
}
