// Клієнт для Wialon Remote API. Див. docs/wialon-integration-plan.md розділ 1.
//
// Мапінг ТЗ ↔ Wialon відбувається виключно через Truck.wialonUnitId (адміністратор
// заповнює вручну через UI) — назва unit-а у Wialon (item.nm) ненадійна: в цьому
// акаунті частина юнітів названа просто держ. номером, частина — "Ім'я водія + номер".
// Тому тут немає жодного парсингу plate з Wialon.

export interface WialonUnit {
  wialonUnitId: string;
  odometerKm: number;
  lat: number;
  lon: number;
  fuelLevelPercent: number | null; // null, якщо не вдалось визначити зі стану сенсора
  lastUpdate: Date;
}

// Гаверсин — відстань між двома точками на сфері (км). Використовується, щоб визначити,
// чи ТЗ фізично на базі (див. DEPOT_LAT/DEPOT_LON/DEPOT_RADIUS_KM у sync-service/src/index.ts).
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const BASE_URL = process.env.WIALON_BASE_URL ?? 'https://hst-api.wialon.com/wialon/ajax.html';
const TOKEN = process.env.WIALON_TOKEN;

let sid: string | null = null;

async function call<T = any>(svc: string, params: Record<string, unknown>): Promise<T> {
  const url = `${BASE_URL}?svc=${svc}&params=${encodeURIComponent(JSON.stringify(params))}${sid ? `&sid=${sid}` : ''}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data?.error) {
    throw new Error(`Wialon API error (${svc}): код ${data.error}`);
  }
  return data as T;
}

export async function login(): Promise<string> {
  if (!TOKEN) throw new Error('WIALON_TOKEN не задано в .env');
  const res = await call<{ eid: string }>('token/login', { token: TOKEN });
  sid = res.eid;
  return sid;
}

// flags: 1 (base) + 1024 (position) + 8192 (counters, зокрема cnm_km — пробіг у км)
const SEARCH_FLAGS = 1 + 1024 + 8192;

interface WialonSearchItem {
  id: number;
  nm: string;
  pos?: { t: number; s: number; y: number; x: number };
  cnm_km?: number;
}

export async function getUnits(): Promise<WialonUnit[]> {
  if (!sid) await login();
  const res = await call<{ items: WialonSearchItem[] }>('core/search_items', {
    spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1,
    flags: SEARCH_FLAGS,
    from: 0,
    to: 0,
  });

  return (res.items ?? []).map((item) => ({
    wialonUnitId: String(item.id),
    odometerKm: item.cnm_km ?? 0,
    lat: item.pos?.y ?? 0,
    lon: item.pos?.x ?? 0,
    // TODO: розрахунок фактичного рівня пального потребує unit/calc_sensors —
    // окрема задача, коли дійдемо до розділу "Паливо".
    fuelLevelPercent: null,
    lastUpdate: item.pos?.t ? new Date(item.pos.t * 1000) : new Date(),
  }));
}

// Ресурс/шаблон офіційного Wialon-звіту "Пробіг" (report/exec_report) — специфічні для
// акаунту id, тому винесені в env з дефолтами, знайденими для фірмового акаунту TransPack.
const REPORT_RESOURCE_ID = Number(process.env.WIALON_REPORT_RESOURCE_ID ?? 799052);
const REPORT_TEMPLATE_ID = Number(process.env.WIALON_REPORT_TEMPLATE_ID ?? 1);

interface WialonReportTable {
  name: string;
  rows: number;
  total: (string | number)[];
  totalRaw: { v: number; vt: number }[];
}

interface WialonExecReportResult {
  reportResult?: { tables?: WialonReportTable[] };
}

// Пробіг у поїздках (км) за інтервал [from, to] для одного unit — офіційний звіт Wialon,
// а не сирий лічильник одометра (який не відкалібрований). Якщо рейсів не було —
// таблиці unit_trips просто немає у відповіді (замість неї, напр., unit_stays) — це 0 км.
export async function getTripMileageKm(wialonUnitId: string, from: Date, to: Date): Promise<number> {
  if (!sid) await login();
  const exec = await call<WialonExecReportResult>('report/exec_report', {
    reportResourceId: REPORT_RESOURCE_ID,
    reportTemplateId: REPORT_TEMPLATE_ID,
    reportObjectId: Number(wialonUnitId),
    reportObjectSecId: 0,
    interval: { from: Math.floor(from.getTime() / 1000), to: Math.floor(to.getTime() / 1000), flags: 0 },
  });

  const tripsTable = exec.reportResult?.tables?.find((t) => t.name === 'unit_trips');
  if (!tripsTable) return 0;

  // totalRaw останньої колонки ("Пробіг") — значення в метрах (vt:10 — тип "mileage")
  const raw = tripsTable.totalRaw?.[tripsTable.totalRaw.length - 1];
  if (raw?.vt === 10) return raw.v / 1000;

  // fallback: розпарсити відображуваний текст на кшталт "2544 km"
  const text = String(tripsTable.total?.[tripsTable.total.length - 1] ?? '0');
  return Number(text.replace(/[^\d.]/g, '')) || 0;
}

// Ресурс з довідником водіїв — специфічний для акаунту, як і звіт вище.
const DRIVERS_RESOURCE_ID = Number(process.env.WIALON_DRIVERS_RESOURCE_ID ?? 18412006);

export interface WialonDriver {
  wialonDriverId: string;
  fullName: string;
  phone: string | null;
  // wialonUnitId ТЗ, за яким водій закріплений у Wialon ("bu" — bound unit).
  // Деякі записи мають явно сміттєве значення "bu" (застарілі/невідомі прив'язки,
  // на порядки більші за реальні id юнітів) — такі трактуємо як "без прив'язки".
  boundWialonUnitId: string | null;
}

interface WialonDriverRaw {
  id: number;
  n: string;
  p?: string;
  bu?: number;
}

export async function getDrivers(): Promise<WialonDriver[]> {
  if (!sid) await login();
  // Точний біт прапора для "drivers" у офіційній документації не задокументований під рукою;
  // емпірично підтверджено лише повний набір прапорів (0xFFFFFFFF) — його й використовуємо.
  const res = await call<{ item?: { drvrs?: Record<string, WialonDriverRaw> } }>('core/search_item', {
    id: DRIVERS_RESOURCE_ID,
    flags: 0xffffffff,
  });

  const raw = Object.values(res.item?.drvrs ?? {});
  return raw.map((d) => ({
    wialonDriverId: String(d.id),
    fullName: d.n.trim(),
    phone: d.p?.trim() || null,
    boundWialonUnitId: d.bu && d.bu > 0 && d.bu < 1e9 ? String(d.bu) : null,
  }));
}
