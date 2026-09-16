// Клієнт для Wialon Remote API. Див. docs/wialon-integration-plan.md розділ 1.
//
// Мапінг ТЗ ↔ Wialon відбувається виключно через Truck.wialonUnitId (адміністратор
// заповнює вручну через UI) — назва unit-а у Wialon (item.nm) ненадійна: в деяких
// акаунтах частина юнітів названа просто держ. номером, частина — "Ім'я водія + номер".
// Тому тут немає жодного парсингу plate з Wialon.
//
// Фабрика createWialonClient(config), а не модуль-singleton: sync-service обробляє
// декілька компаній (кожна зі своїм Wialon-акаунтом/токеном) в одному процесі, тож
// сесія (sid) не може бути єдиною на весь модуль — кожен createWialonClient() тримає
// власний sid у замиканні, незалежний від інших компаній.

export interface WialonUnit {
  wialonUnitId: string;
  odometerKm: number;
  lat: number;
  lon: number;
  fuelLevelPercent: number | null; // null, якщо не вдалось визначити зі стану сенсора
  lastUpdate: Date;
}

// Гаверсин — відстань між двома точками на сфері (км). Використовується, щоб визначити,
// чи ТЗ фізично на базі (депо кожної компанії — CompanyWialonConfig.depotLat/Lon/RadiusKm).
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface WialonTripLeg {
  fromAddress: string;
  toAddress: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distanceKm: number;
  startedAt: Date;
  endedAt: Date;
}

export interface WialonDriver {
  wialonDriverId: string;
  fullName: string;
  phone: string | null;
  // wialonUnitId ТЗ, за яким водій закріплений у Wialon ("bu" — bound unit).
  // Деякі записи мають явно сміттєве значення "bu" (застарілі/невідомі прив'язки,
  // на порядки більші за реальні id юнітів) — такі трактуємо як "без прив'язки".
  boundWialonUnitId: string | null;
}

export interface WialonClientConfig {
  token: string;
  baseUrl?: string | null;
  // Ресурс/шаблон офіційного Wialon-звіту "Пробіг" (report/exec_report) і довідник
  // водіїв — специфічні для кожного Wialon-акаунту (кожна компанія знаходить свої
  // через Wialon UI: Ресурси → потрібний ресурс → id).
  reportResourceId: number;
  reportTemplateId: number;
  driversResourceId?: number | null;
}

export interface WialonClient {
  login(): Promise<string>;
  getUnits(): Promise<WialonUnit[]>;
  getTripMileageKm(wialonUnitId: string, from: Date, to: Date): Promise<number>;
  getTrips(wialonUnitId: string, from: Date, to: Date): Promise<WialonTripLeg[]>;
  getDrivers(): Promise<WialonDriver[]>;
}

const DEFAULT_BASE_URL = 'https://hst-api.wialon.com/wialon/ajax.html';

// flags: 1 (base) + 1024 (position) + 8192 (counters, зокрема cnm_km — пробіг у км)
const SEARCH_FLAGS = 1 + 1024 + 8192;

interface WialonSearchItem {
  id: number;
  nm: string;
  pos?: { t: number; s: number; y: number; x: number };
  cnm_km?: number;
}

interface WialonReportTable {
  name: string;
  rows: number;
  total: (string | number)[];
  totalRaw: { v: number; vt: number }[];
}

interface WialonExecReportResult {
  reportResult?: { tables?: WialonReportTable[] };
}

interface WialonReportRow {
  t1: number;
  t2: number;
  c: (string | { t: string; v?: number; y?: number; x?: number; u?: number })[];
}

interface WialonDriverRaw {
  id: number;
  n: string;
  p?: string;
  bu?: number;
}

function isPointCell(v: unknown): v is { t: string; y?: number; x?: number } {
  return typeof v === 'object' && v !== null && 'y' in v;
}

export function createWialonClient(config: WialonClientConfig): WialonClient {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  let sid: string | null = null;

  async function call<T = any>(svc: string, params: Record<string, unknown>): Promise<T> {
    const url = `${baseUrl}?svc=${svc}&params=${encodeURIComponent(JSON.stringify(params))}${sid ? `&sid=${sid}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.error) {
      throw new Error(`Wialon API error (${svc}): код ${data.error}`);
    }
    return data as T;
  }

  async function login(): Promise<string> {
    const res = await call<{ eid: string }>('token/login', { token: config.token });
    sid = res.eid;
    return sid;
  }

  async function getUnits(): Promise<WialonUnit[]> {
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

  // Пробіг у поїздках (км) за інтервал [from, to] для одного unit — офіційний звіт Wialon,
  // а не сирий лічильник одометра (який не відкалібрований). Якщо рейсів не було —
  // таблиці unit_trips просто немає у відповіді (замість неї, напр., unit_stays) — це 0 км.
  async function getTripMileageKm(wialonUnitId: string, from: Date, to: Date): Promise<number> {
    if (!sid) await login();
    const exec = await call<WialonExecReportResult>('report/exec_report', {
      reportResourceId: config.reportResourceId,
      reportTemplateId: config.reportTemplateId,
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

  // Один "сирий" GPS-відрізок поїздки з того самого звіту "Пробіг" (таблиця unit_trips) —
  // Wialon сам детектує поїздки й реверс-геокодує адреси початку/кінця, без потреби в
  // геозонах. Це не бізнес-рейс сам по собі (їх може бути кілька за один виїзд з бази) —
  // групування в "депо → місто" робить викликач (syncRoutesForTruck у index.ts).
  async function getTrips(wialonUnitId: string, from: Date, to: Date): Promise<WialonTripLeg[]> {
    if (!sid) await login();
    const exec = await call<WialonExecReportResult>('report/exec_report', {
      reportResourceId: config.reportResourceId,
      reportTemplateId: config.reportTemplateId,
      reportObjectId: Number(wialonUnitId),
      reportObjectSecId: 0,
      interval: { from: Math.floor(from.getTime() / 1000), to: Math.floor(to.getTime() / 1000), flags: 0 },
    });

    const tables = exec.reportResult?.tables ?? [];
    const tableIndex = tables.findIndex((t) => t.name === 'unit_trips');
    if (tableIndex === -1) return [];

    const rows = await call<WialonReportRow[]>('report/get_result_rows', {
      tableIndex,
      indexFrom: 0,
      indexTo: tables[tableIndex].rows,
    });

    // Колонки unit_trips: [№, дата, {початок: час+координати}, {початок: адреса}, кінець-час,
    // {кінець: адреса+координати}, тривалість, "N km"] — час/адреса початку й кінця мають
    // координати (y/x), точні unix-мітки беремо з рядка (t1/t2), а не з колонок.
    return rows
      .map((row): WialonTripLeg | null => {
        const fromPoint = row.c[2];
        const fromAddr = row.c[3];
        const toAddr = row.c[5];
        const distanceText = String(row.c[7] ?? '0');
        if (!isPointCell(fromPoint) || !isPointCell(fromAddr) || !isPointCell(toAddr)) return null;
        return {
          fromAddress: fromAddr.t,
          toAddress: toAddr.t,
          fromLat: fromPoint.y ?? 0,
          fromLon: fromPoint.x ?? 0,
          toLat: toAddr.y ?? 0,
          toLon: toAddr.x ?? 0,
          distanceKm: Number(distanceText.replace(/[^\d.]/g, '')) || 0,
          startedAt: new Date(row.t1 * 1000),
          endedAt: new Date(row.t2 * 1000),
        };
      })
      .filter((t): t is WialonTripLeg => t !== null);
  }

  async function getDrivers(): Promise<WialonDriver[]> {
    if (!sid) await login();
    if (!config.driversResourceId) return [];
    // Точний біт прапора для "drivers" у офіційній документації не задокументований під рукою;
    // емпірично підтверджено лише повний набір прапорів (0xFFFFFFFF) — його й використовуємо.
    const res = await call<{ item?: { drvrs?: Record<string, WialonDriverRaw> } }>('core/search_item', {
      id: config.driversResourceId,
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

  return { login, getUnits, getTripMileageKm, getTrips, getDrivers };
}
