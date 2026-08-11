// Клієнт для Wialon Remote API.
// Зараз повертає мок-дані — коли буде отримано токен доступу, замінити тіла
// функцій на реальні запити (token/login, unit/get_position тощо),
// НЕ змінюючи сигнатури — решта sync-service від цього не залежить.

export interface WialonUnit {
  wialonUnitId: string;
  plate: string;
  odometerKm: number;
  isMoving: boolean;
  fuelLevelPercent: number | null; // null, якщо датчика немає
  lastUpdate: Date;
}

let sid: string | null = null;

export async function login(): Promise<string> {
  // TODO: реальний виклик
  // const res = await fetch(`https://hst-api.wialon.com/wialon/ajax.html?svc=token/login&params={"token":"${process.env.WIALON_TOKEN}"}`);
  // const data = await res.json();
  // sid = data.eid;
  sid = 'mock-session-id';
  return sid;
}

export async function getUnits(): Promise<WialonUnit[]> {
  // TODO: реальний виклик core/search_items (itemsType: avl_unit) + unit/get_position
  return MOCK_UNITS;
}

const MOCK_UNITS: WialonUnit[] = Array.from({ length: 30 }).map((_, i) => ({
  wialonUnitId: `unit_${i + 1}`,
  plate: `BC ${1000 + i * 7} AA`,
  odometerKm: 80000 + Math.round(Math.random() * 300000),
  isMoving: Math.random() > 0.4,
  fuelLevelPercent: Math.random() > 0.3 ? Math.round(Math.random() * 100) : null,
  lastUpdate: new Date(),
}));
