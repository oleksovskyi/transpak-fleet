import { MileageLog } from '../types';

// MileageLog зберігає КУМУЛЯТИВНИЙ одометр ТЗ на конкретний день (щоденний знімок від
// sync-service), а не дельту за день — і знімки є не щодня (лише відколи ТЗ відкалібровано,
// і не завжди рівно по одному на добу). Тому "скільки проїхав ТЗ на дату X" — це forward-fill:
// беремо останній відомий знімок на цю дату або раніше.
// logsForTruck має бути відсортований за зростанням дати (див. groupByTruck) — тоді
// останній запис не пізніше `date` і є потрібним знімком.
function valueAsOf(logsForTruck: MileageLog[], date: Date): number | null {
  let result: number | null = null;
  for (const log of logsForTruck) {
    if (new Date(log.date).getTime() > date.getTime()) break;
    result = log.km;
  }
  return result;
}

function groupByTruck(logs: MileageLog[]): Map<string, MileageLog[]> {
  const map = new Map<string, MileageLog[]>();
  for (const log of logs) {
    const arr = map.get(log.truckId);
    if (arr) arr.push(log);
    else map.set(log.truckId, [log]);
  }
  for (const arr of map.values()) arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return map;
}

// Жоден реальний ТЗ фізично не проїде більше за це на добу — використовується, щоб відрізнити
// справжній пробіг від одноразової ручної корекції одометра (напр. масове виставлення
// "стартового" пробігу при первинному налаштуванні парку): така корекція виглядає як миттєвий
// стрибок на десятки-сотні тисяч км за один день.
const MAX_PLAUSIBLE_KM_PER_DAY = 5000;

// Пробіг ТЗ за період [from, to], стійкий до одноразових "стрибків" одометра НЕЗАЛЕЖНО від
// довжини самого вікна: якщо перевіряти правдоподібність лише сумарної дельти за весь період,
// короткий штучний стрибок губиться під загальним лімітом довгого вікна (напр. 100 000 км за
// один день проходить непоміченим у ліміті "5000 км/добу × 30 днів = 150 000"). Тому рахуємо
// суму послідовних приростів між усіма реальними знімками в межах вікна, і кожен приріст
// перевіряємо на правдоподібність окремо — з урахуванням часу саме між тими двома знімками.
function truckPlausibleAccumulatedDelta(logsForTruck: MileageLog[], from: Date, to: Date): number {
  const inWindow = logsForTruck.filter((l) => {
    const t = new Date(l.date).getTime();
    return t > from.getTime() && t <= to.getTime();
  });

  const startFromAnchor = valueAsOf(logsForTruck, from);
  const startKm = startFromAnchor ?? inWindow[0]?.km ?? null;
  if (startKm == null) return 0;
  const startTime = startFromAnchor != null ? from.getTime() : new Date(inWindow[0].date).getTime();

  const checkpoints: { time: number; km: number }[] = [{ time: startTime, km: startKm }];
  for (const log of inWindow) {
    const t = new Date(log.date).getTime();
    if (t > startTime) checkpoints.push({ time: t, km: log.km });
  }
  const atTo = valueAsOf(logsForTruck, to);
  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  if (atTo != null && lastCheckpoint.time < to.getTime()) {
    checkpoints.push({ time: to.getTime(), km: atTo });
  }

  let total = 0;
  for (let i = 0; i < checkpoints.length - 1; i++) {
    const segKm = checkpoints[i + 1].km - checkpoints[i].km;
    const segDays = Math.max(1, (checkpoints[i + 1].time - checkpoints[i].time) / 86400000);
    if (segKm > 0 && segKm <= segDays * MAX_PLAUSIBLE_KM_PER_DAY) total += segKm;
  }
  return total;
}

export interface DriverMileageRow {
  driverId: string;
  driverName: string;
  km: number;
}

// Пробіг по водіях — наближено: рахуємо за ПОТОЧНИМ закріпленням ТЗ за водієм (історії
// призначень водій↔ТЗ в системі немає), а не за тим, хто фактично керував у кожен момент
// періоду. Прийнятне спрощення, але не видавати заточний облік.
export function driverMileageInRange(logs: MileageLog[], from: Date, to: Date): DriverMileageRow[] {
  const byTruck = groupByTruck(logs);
  const byDriver = new Map<string, DriverMileageRow>();
  for (const [, truckLogs] of byTruck) {
    const driver = truckLogs[0]?.truck.driver;
    if (!driver) continue;
    const delta = truckPlausibleAccumulatedDelta(truckLogs, from, to);
    if (delta <= 0) continue;
    const existing = byDriver.get(driver.id);
    if (existing) existing.km += delta;
    else byDriver.set(driver.id, { driverId: driver.id, driverName: driver.fullName, km: delta });
  }
  return Array.from(byDriver.values()).sort((a, b) => b.km - a.km);
}

export interface FleetMileagePoint {
  label: string;
  km: number;
}

export type MileageBucket = 'day' | 'week' | 'month';

function bucketStart(date: Date, bucket: MileageBucket): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (bucket === 'day') return d;
  if (bucket === 'week') {
    const dow = (d.getDay() + 6) % 7; // понеділок = 0
    d.setDate(d.getDate() - dow);
    return d;
  }
  d.setDate(1);
  return d;
}

function bucketLabel(date: Date, bucket: MileageBucket): string {
  if (bucket === 'month') return date.toLocaleDateString('uk-UA', { month: 'short', year: '2-digit' });
  return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

// Сумарний пробіг УСЬОГО парку за кожен бакет (день/тиждень/місяць) у діапазоні [from, to]:
// для кожного ТЗ — дельта одометра МІЖ ПОЧАТКОМ ЦЬОГО БАКЕТА І ПОЧАТКОМ НАСТУПНОГО,
// просумована по всіх ТЗ. Важливо рахувати саме так (а не "від початку до кінця того самого
// бакета"): знімок одометра пишеться лише РАЗ на добу (на початку доби), тож при бакеті
// "день" обидві межі "початок/кінець одного й того ж дня" впирались би в той самий єдиний
// знімок і завжди давали 0 — реальна дельта видно лише між знімком цього дня і знімком
// наступного.
export function fleetMileageSeries(logs: MileageLog[], from: Date, to: Date, bucket: MileageBucket): FleetMileagePoint[] {
  const byTruck = groupByTruck(logs);

  const cutoffs: Date[] = [];
  let cursor = bucketStart(from, bucket);
  while (cursor.getTime() <= to.getTime()) {
    cutoffs.push(new Date(cursor));
    if (bucket === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (bucket === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  cutoffs.push(to); // межа "зараз" — щоб останній бакет теж мав дельту до сьогодні

  const points: FleetMileagePoint[] = [];
  for (let i = 0; i < cutoffs.length - 1; i++) {
    const bucketFrom = cutoffs[i];
    const bucketTo = cutoffs[i + 1];
    let totalKm = 0;
    for (const [, truckLogs] of byTruck) {
      totalKm += truckPlausibleAccumulatedDelta(truckLogs, bucketFrom, bucketTo);
    }
    points.push({ label: bucketLabel(bucketFrom, bucket), km: Math.round(totalKm) });
  }
  return points;
}

// Режими перегляду — не "останні N днів", а гранулярність бакета з розумним "вікном" за
// замовчуванням, щоб бачити патерни: "День" — денні стовпчики за 2 тижні (видно різницю
// вт-ср проти пн/пт), "Тиждень" — тижневі за ~3 місяці, "Місяць" — місячні за рік (видно,
// що, напр., червень завжди напружений, а грудень ні).
export type FleetViewMode = 'day' | 'week' | 'month';

export function viewModeRange(mode: FleetViewMode): { from: Date; to: Date; bucket: MileageBucket } {
  const to = new Date();
  const days = mode === 'day' ? 14 : mode === 'week' ? 84 : 365;
  const from = new Date(to.getTime() - days * 86400000);
  return { from, to, bucket: mode };
}

export function customRangeBucket(from: Date, to: Date): MileageBucket {
  const days = (to.getTime() - from.getTime()) / 86400000;
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
}
