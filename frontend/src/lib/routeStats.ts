import { RouteLog } from '../types';

// Має збігатися з DEPOT_LAT/DEPOT_LON у sync-service/.env — потрібне тут лише для того,
// щоб серед розпізнаних зупинок одного виїзду визначити геометрично найвіддаленішу
// (справжню ціль рейсу), а не хронологічно останню (яка може бути ближчим селом, повз яке
// ТЗ проїжджав уже на зворотному шляху).
const DEPOT_LAT = 49.3295;
const DEPOT_LON = 24.0915;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface AggregatedRow {
  key: string;
  fromCity: string;
  toCity: string;
  trips: number;
  totalDistanceKm: number;
  plates: string[]; // усі ТЗ, які фактично їздили цим напрямком
}

// "Найпопулярніші маршрути" — показник напрямку по всьому парку, а не окремого ТЗ, тож
// plate свідомо НЕ входить у ключ групування (інакше однаковий маршрут різних ТЗ ніколи не
// збирався б в один рядок). Групуємо за фактичним пунктом призначення, а не повним текстом
// toCity: Wialon по-різному сегментує той самий реальний рейс між запусками звіту, і місто,
// яке було лише проїздом (напр. Київ по дорозі в Броники), не повинно змішуватись зі
// статистикою рейсів, де воно й було ціллю. "Пункт призначення" визначаємо як геометрично
// найвіддаленішу від депо зупинку серед розпізнаних — а не хронологічно останню: тур може
// проїжджати через одне й те саме близьке село двічі (по дорозі туди й майже перед
// поверненням), і останнім за часом тоді буде саме воно, а не справжня ціль рейсу. Ручні
// записи зупинок не мають — для них групування лишається як і раніше, по fromCity/toCity.
export function aggregateRoutes(logs: RouteLog[]): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const log of logs) {
    const targetStop =
      log.source === 'auto' && log.stops.length > 0
        ? log.stops.reduce((farthest, s) =>
            distanceKm(s.lat, s.lon, DEPOT_LAT, DEPOT_LON) > distanceKm(farthest.lat, farthest.lon, DEPOT_LAT, DEPOT_LON)
              ? s
              : farthest,
          )
        : null;
    const toCityForGrouping = targetStop?.label ?? log.toCity;
    const key = `${log.fromCity}::${toCityForGrouping}`;
    const existing = map.get(key);
    if (existing) {
      existing.trips += 1;
      existing.totalDistanceKm += log.distanceKm;
      if (!existing.plates.includes(log.truck.plate)) existing.plates.push(log.truck.plate);
    } else {
      map.set(key, {
        key,
        fromCity: log.fromCity,
        toCity: toCityForGrouping,
        trips: 1,
        totalDistanceKm: log.distanceKm,
        plates: [log.truck.plate],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.trips - a.trips);
}
