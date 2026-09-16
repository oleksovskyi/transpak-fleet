import 'dotenv/config';
import cron from 'node-cron';
import { PrismaClient } from './prisma';
import type { CompanyWialonConfig } from '@prisma/client';
import { createWialonClient, distanceKm, WialonClient } from './wialonClient';

const prisma = new PrismaClient();

// Один процес обробляє всіх клієнтів платформи — Wialon-креденшели й депо кожного
// живуть у CompanyWialonConfig (БД), а не в .env одного деплою. Новий клієнт = новий
// рядок у цій таблиці (через POST /api/platform/companies/:id/wialon-config), без
// нового Railway-сервісу. enabled=false тимчасово ставить компанію на паузу.
async function loadConfigs(companyIdFilter?: string): Promise<CompanyWialonConfig[]> {
  return prisma.companyWialonConfig.findMany({
    where: { enabled: true, ...(companyIdFilter ? { companyId: companyIdFilter } : {}) },
  });
}

function clientFor(config: CompanyWialonConfig): WialonClient {
  return createWialonClient({
    token: config.wialonToken,
    baseUrl: config.wialonBaseUrl,
    reportResourceId: config.wialonReportResourceId,
    reportTemplateId: config.wialonReportTemplateId,
    driversResourceId: config.wialonDriversResourceId,
  });
}

// Межі України з запасом на прикордонні області — GPS-точка далеко поза ними майже напевно
// наслідок РЕБ-спуфінгу (глушіння/підміна координат у зоні бойових дій), а не реальне
// переміщення ТЗ. Використовується і в live-синку (syncOnceForCompany), і в маршрутах.
const UKRAINE_LAT_RANGE: [number, number] = [43, 53];
const UKRAINE_LON_RANGE: [number, number] = [20, 41];
function isPlausiblePosition(lat: number, lon: number): boolean {
  return (
    lat >= UKRAINE_LAT_RANGE[0] &&
    lat <= UKRAINE_LAT_RANGE[1] &&
    lon >= UKRAINE_LON_RANGE[0] &&
    lon <= UKRAINE_LON_RANGE[1]
  );
}

// Wialon-адреса точки треку ("Харків 61145, Лопанська вул., 28/16" або, поблизу малих
// населених пунктів, "Затишна, 0.84 km from Гніздичів 81740") → читабельна назва місця для
// послідовності міст у RouteLog. "N km from X" трактуємо як "біля X" (ТЗ не заїжджав у саме
// місто, лише проїжджав повз) — на відміну від прямого "X ПОШТ.ІНДЕКС, вулиця" (реально в
// місті). Якщо в адресі взагалі немає розпізнаваного населеного пункту (лише вулиця й індекс,
// напр. "Промислова, 21011") — повертаємо null, така точка просто не потрапляє в послідовність.
// Так само null, якщо сама назва порожня — Wialon іноді лишає подвійний пробіл там, де мав би
// бути населений пункт (напр. "М-06, 0.09 km from  34715"), і без цієї перевірки регулярний
// вираз "успішно" зловив би порожній рядок.
function extractPlaceLabel(address: string): string | null {
  const kmFromMatch = address.match(/km from\s+([^\d,]+?)\s*\d{5}/i);
  if (kmFromMatch && kmFromMatch[1].trim()) return `біля ${kmFromMatch[1].trim()}`;
  const postalMatch = address.match(/^([^\d,]+?)\s+\d{5}\b/);
  if (postalMatch && postalMatch[1].trim()) return postalMatch[1].trim();
  return null;
}

// Перші дві цифри українського поштового індексу однозначно визначають область (стала
// структура Укрпошти з 1999 року, перевірено проти реальних адрес із цієї ж сесії: 79xxx —
// Львівська обл., 61xxx — Харківська, 21xxx — Вінницька, 29xxx — Хмельницька, 36xxx —
// Полтавська, 07-09xxx — Київська). Використовуємо це як орієнтир (область, не точне місто),
// коли Wialon дав індекс, але не назву населеного пункту.
const POSTAL_PREFIX_REGION: [number, number, string][] = [
  [1, 6, 'Києва'],
  [7, 9, 'Київської обл.'],
  [10, 13, 'Житомирської обл.'],
  [14, 17, 'Чернігівської обл.'],
  [18, 20, 'Черкаської обл.'],
  [21, 24, 'Вінниці'],
  [25, 28, 'Кропивницького'],
  [29, 32, 'Хмельницького'],
  [33, 35, 'Рівного'],
  [36, 39, 'Полтави'],
  [40, 42, 'Сум'],
  [43, 45, 'Луцька'],
  [46, 48, 'Тернополя'],
  [49, 53, 'Дніпра'],
  [54, 57, 'Миколаєва'],
  [58, 60, 'Чернівців'],
  [61, 64, 'Харкова'],
  [65, 68, 'Одеси'],
  [69, 72, 'Запоріжжя'],
  [73, 75, 'Херсона'],
  [76, 78, 'Івано-Франківська'],
  [79, 82, 'Львова'],
  [83, 87, 'Донецька'],
  [88, 90, 'Ужгорода'],
  [91, 94, 'Луганська'],
  [95, 98, 'Криму'],
  [99, 99, 'Севастополя'],
];

function extractPostalCode(address: string): string | null {
  const m = address.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function regionFromPostalCode(code: string): string | null {
  const prefix = Number(code.slice(0, 2));
  const entry = POSTAL_PREFIX_REGION.find(([lo, hi]) => prefix >= lo && prefix <= hi);
  return entry ? entry[2] : null;
}

// Якщо за весь виїзд жодна точка треку не дала розпізнаваної назви (вкрай рідкісний випадок —
// самі лише "вулиця, індекс" без населеного пункту) — показуємо орієнтовний регіон за
// поштовим індексом (якщо він був в адресі) і координати, а не порожній запис.
function unmatchedDestinationLabel(lat: number | null, lon: number | null, region?: string | null): string {
  if (lat == null || lon == null) return 'Невідомо';
  const coords = `координати (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  return region ? `Поблизу ${region}, ${coords}` : `Точка не налаштована, ${coords}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function syncOnceForCompany(config: CompanyWialonConfig, client: WialonClient) {
  await client.login();
  const units = await client.getUnits();

  let matched = 0;
  for (const unit of units) {
    const truck = await prisma.truck.findFirst({
      where: { wialonUnitId: unit.wialonUnitId, companyId: config.companyId },
    });
    if (!truck) continue; // ТЗ ще не прив'язано до Wialon unit в адмінці

    matched++;

    // Wialon-лічильник 0 означає "не відкалібровано", а не "реально 0 км" — не затираємо
    // ані сам пробіг (може бути введений адміном вручну), ані пишемо фейковий MileageLog.
    const hasRealOdometer = unit.odometerKm > 0;
    // lat/lon = 0,0 означає "Wialon не віддав позицію" (wialonClient підставляє 0 за
    // відсутності item.pos) — не пишемо в БД, щоб ТЗ не "телепортувався" на Null Island.
    // isPlausiblePosition відсікає інший випадок "телепортації" — РЕБ (глушіння/підміна
    // GPS у зоні бойових дій) іноді змушує навігатор показати ТЗ десь за межами України
    // (на практиці бачили точку в Лімі, Перу) — довіряти такій позиції не можна: ні для
    // карти, ні для статусу "На базі".
    const hasPosition = (unit.lat !== 0 || unit.lon !== 0) && isPlausiblePosition(unit.lat, unit.lon);
    const atBase = hasPosition && distanceKm(unit.lat, unit.lon, config.depotLat, config.depotLon) <= config.depotRadiusKm;

    await prisma.truck.update({
      where: { id: truck.id },
      data: {
        ...(hasRealOdometer ? { totalMileageKm: unit.odometerKm } : {}),
        ...(hasPosition ? { lat: unit.lat, lon: unit.lon, positionUpdatedAt: new Date() } : {}),
        status: truck.status === 'repair' ? 'repair' : atBase ? 'free' : 'trip',
      },
    });

    if (hasRealOdometer) {
      await prisma.mileageLog.upsert({
        where: { truckId_date: { truckId: truck.id, date: startOfDay(new Date()) } },
        update: { km: unit.odometerKm },
        create: { truckId: truck.id, date: startOfDay(new Date()), km: unit.odometerKm },
      });
    }

    // TODO: генерація сповіщень (maintenance_soon / maintenance_overdue) —
    // порівняти unit.odometerKm з truck_maintenance_status + maintenance_type.interval_km
  }

  console.log(
    `[sync] ${config.companyId}: Wialon ${units.length} unit(s), прив'язано й оновлено: ${matched} ТЗ, ${new Date().toISOString()}`,
  );
}

// "Калібрування" пробігу: для ТЗ, де адмін хоч раз вручну ввів пробіг (mileageBaselineAt
// заданий), рахуємо totalMileageKm = mileageBaselineKm + пробіг у поїздках за офіційним
// Wialon-звітом від mileageBaselineAt до зараз. ТЗ без калібрування цей крок не чіпає.
async function syncMileageForCompany(config: CompanyWialonConfig, client: WialonClient) {
  await client.login();
  const trucks = await prisma.truck.findMany({
    where: { companyId: config.companyId, wialonUnitId: { not: null }, mileageBaselineAt: { not: null } },
  });

  const now = new Date();
  let updated = 0;
  for (const truck of trucks) {
    try {
      const deltaKm = await client.getTripMileageKm(truck.wialonUnitId!, truck.mileageBaselineAt!, now);
      const newTotal = Math.round((truck.mileageBaselineKm ?? 0) + deltaKm);

      await prisma.truck.update({ where: { id: truck.id }, data: { totalMileageKm: newTotal } });
      await prisma.mileageLog.upsert({
        where: { truckId_date: { truckId: truck.id, date: startOfDay(now) } },
        update: { km: newTotal },
        create: { truckId: truck.id, date: startOfDay(now), km: newTotal },
      });
      updated++;
    } catch (err) {
      console.error(`[mileage] помилка для ${truck.plate}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(
    `[mileage] ${config.companyId}: оновлено пробіг для ${updated} з ${trucks.length} відкаліброваних ТЗ, ${now.toISOString()}`,
  );
}

// Одноразовий імпорт водіїв із Wialon (npm run import-drivers -- --company-id=...). Не чіпає
// ТЗ, які вже мають закріпленого водія вручну — щоб нічого не перезаписати; так само пропускає
// водіїв, які вже є в базі (за збігом імені), щоб повторний запуск не плодив дублікатів.
async function importDriversForCompany(config: CompanyWialonConfig, client: WialonClient) {
  await client.login();
  const wialonDrivers = await client.getDrivers();

  let created = 0;
  let skipped = 0;
  let assigned = 0;
  for (const wd of wialonDrivers) {
    const existing = await prisma.driver.findFirst({ where: { fullName: wd.fullName, companyId: config.companyId } });
    if (existing) {
      skipped++;
      console.log(`[drivers] "${wd.fullName}" вже існує — пропущено`);
      continue;
    }

    const driver = await prisma.driver.create({ data: { fullName: wd.fullName, companyId: config.companyId } });
    created++;

    if (!wd.boundWialonUnitId) {
      console.log(`[drivers] "${wd.fullName}" створено, без прив'язки до ТЗ`);
      continue;
    }
    const truck = await prisma.truck.findFirst({
      where: { wialonUnitId: wd.boundWialonUnitId, companyId: config.companyId },
    });
    if (!truck) {
      console.log(`[drivers] "${wd.fullName}" створено, прив'язаний ТЗ (unit ${wd.boundWialonUnitId}) не знайдено в базі`);
    } else if (truck.driverId) {
      console.log(`[drivers] "${wd.fullName}" створено, але ${truck.plate} вже має водія — не перезаписую`);
    } else {
      await prisma.truck.update({ where: { id: truck.id }, data: { driverId: driver.id } });
      assigned++;
      console.log(`[drivers] "${wd.fullName}" створено й закріплено за ${truck.plate}`);
    }
  }

  console.log(
    `[drivers] ${config.companyId}: з Wialon: ${wialonDrivers.length}, створено: ${created}, вже існували: ${skipped}, закріплено за ТЗ: ${assigned}`,
  );
}

// Синхронізація маршрутів з Wialon-звіту "Пробіг" (unit_trips) — витягує сирі GPS-відрізки
// поїздок кожного ТЗ за минулі `days` днів і групує їх у виїзди від бази: від моменту, коли ТЗ
// покинув радіус депо, до моменту повернення. Один виїзд = один RouteLog з повною
// послідовністю міст, які реально розпізнав Wialon по дорозі (toCity: "Львів → Київ → Львів →
// <депо>", тобто fromCity+toCity разом читаються як увесь тур), distanceKm — сума відрізків за
// весь виїзд. Назва міста — напряму з Wialon-адреси кожної точки (Wialon сам реверс-геокодує),
// без ручного довідника: працює для будь-якого міста без налаштування.
//
// Викликається і як періодична синхронізація (короткий rolling-window, кожну годину — ловить
// щойно завершені виїзди), і як одноразовий глибокий бекфіл (npm run backfill-routes, довгий
// період) — обидва режими ідемпотентні завдяки повній перебудові auto-записів у межах вікна
// [from, to] на кожному виклику (див. коментар нижче), тож повторний виклик для вже обробленого
// періоду нічого не дублює.
//
// Виїзди, чий початок не потрапив у вікно [from, to] (звіт починається "посеред подорожі"),
// свідомо пропускаються — без спостереженого виїзду з бази ми не знаємо ні справжньої точки
// відліку відстані, ні гарантії, що це один виїзд, а не кінець попереднього.
// Обробка маршрутів одного ТЗ — винесена окремо від syncRoutesForCompany, щоб виклик
// getTrips() (Wialon-звіт) можна було обгорнути в try/catch на рівні виклику: цей звіт
// періодично падає з тимчасовою помилкою (напр. "код 4"), і без ізоляції один поганий ТЗ
// обвалював би увесь sync-service — той самий процес, що й live-синк позицій кожні 15 хв.
async function syncRoutesForTruck(
  truck: { id: string; plate: string; wialonUnitId: string | null },
  from: Date,
  to: Date,
  client: WialonClient,
  depot: { lat: number; lon: number; radiusKm: number; name: string },
): Promise<number> {
  // Wialon трохи по-різному сегментує той самий рейс між повторними запитами (звідси й
  // невеликий розкид відстані, напр. 1405 vs 1407 км для того самого виїзду) — точний час
  // виїзду (journeyStartedAt) від разу до разу теж злегка "гуляє", тож перевірка "чи вже є
  // такий запис" за точним співпадінням дати пропускала дублікати. Натомість повністю
  // перебудовуємо auto-записи цього ТЗ в межах вікна [from, to] щоразу — гарантовано без
  // дублів; ручні записи (source: 'manual') це не чіпає.
  await prisma.routeLog.deleteMany({
    where: { truckId: truck.id, source: 'auto', date: { gte: from, lte: to } },
  });

  const legs = await client.getTrips(truck.wialonUnitId!, from, to);
  legs.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  let traveling = false;
  let unknownStart = false;
  let journeyDistanceKm = 0;
  // Кожна розпізнана зупинка — і назва (як і раніше, для toCity), і координати (нове —
  // для RouteLogStop, майбутньої карти маршруту й точнішого групування "найчастіших
  // маршрутів" незалежно від того, як саме Wialon посегментував рейс цього разу).
  let journeyCities: { label: string; lat: number; lon: number }[] = [];
  let journeyFarLat: number | null = null;
  let journeyFarLon: number | null = null;
  let journeyFarRegion: string | null = null;
  let journeyStartedAt: Date | null = null;
  let journeyCount = 0;

  for (const leg of legs) {
    // РЕБ-спуфінг трапляється і в історичних Wialon-звітах (реально бачили відрізок, що
    // починався в Лімі, Перу) — такий відрізок повністю пропускаємо: не рахуємо в
    // дистанцію рейсу і не даємо йому впливати на визначення виїзду/повернення/пункту
    // призначення, бо жодним із цих даних довіряти не можна.
    if (!isPlausiblePosition(leg.fromLat, leg.fromLon) || !isPlausiblePosition(leg.toLat, leg.toLon)) {
      continue;
    }

    const startAtBase = distanceKm(leg.fromLat, leg.fromLon, depot.lat, depot.lon) <= depot.radiusKm;
    const endAtBase = distanceKm(leg.toLat, leg.toLon, depot.lat, depot.lon) <= depot.radiusKm;

    if (!traveling) {
      if (startAtBase && !endAtBase) {
        traveling = true;
        unknownStart = false;
        journeyDistanceKm = 0;
        journeyCities = [];
        journeyFarLat = null;
        journeyFarLon = null;
        journeyFarRegion = null;
        journeyStartedAt = leg.startedAt;
      } else if (!startAtBase && !endAtBase) {
        // застали виїзд уже "в дорозі" — реальної точки відліку не знаємо
        traveling = true;
        unknownStart = true;
      } else {
        // startAtBase && endAtBase -> локальний рух біля бази, не рейс, ігноруємо повністю
        continue;
      }
    }

    // Обробка спільна для щойно ініційованого виїзду (той самий відрізок, що вивів ТЗ з
    // бази) і для вже триваючого — навмисно НЕ пропускаємо перший відрізок: інакше саме
    // його адреса ніколи не розпізнавалась би, і "найвіддаленішою точкою" міг помилково
    // стати відрізок повернення (той, що вже біля депо).
    journeyDistanceKm += leg.distanceKm;
    if (!unknownStart) {
      const label = extractPlaceLabel(leg.toAddress);
      // Wialon іноді відносить точку до депо (широка поштова локальність), навіть якщо
      // вона поза нашим вузьким радіусом бази (напр. 2.5 км від депо) — це не реальна
      // проміжна зупинка, тож не додаємо її в послідовність (інакше вона плодила б
      // "<депо> → <депо> → ..." на початку або зайве "→ біля <депо>" перед фінальним
      // поверненням на відрізку, що й так уже завершує виїзд).
      if (label && label.includes(depot.name)) {
        // ігноруємо — не пункт призначення
      } else if (label) {
        if (journeyCities[journeyCities.length - 1]?.label !== label) {
          journeyCities.push({ label, lat: leg.toLat, lon: leg.toLon });
        }
      } else if (journeyCities.length === 0) {
        const distFromDepot = distanceKm(leg.toLat, leg.toLon, depot.lat, depot.lon);
        const farDist = journeyFarLat != null ? distanceKm(journeyFarLat, journeyFarLon!, depot.lat, depot.lon) : -1;
        if (distFromDepot > farDist) {
          journeyFarLat = leg.toLat;
          journeyFarLon = leg.toLon;
          const postalCode = extractPostalCode(leg.toAddress);
          journeyFarRegion = postalCode ? regionFromPostalCode(postalCode) : null;
        }
      }
    }
    if (endAtBase) {
      // journeyCities буде порожнім лише тоді, коли Wialon за весь виїзд жодного разу не
      // зміг розпізнати населений пункт (рідкість) — пишемо орієнтовний регіон за поштовим
      // індексом і координати найвіддаленішої точки замість пропуску, щоб виїзд не зникав зі
      // статистики "Маршрути" непомітно.
      if (!unknownStart && journeyStartedAt) {
        const rounded = Math.round(journeyDistanceKm);
        if (rounded > 0) {
          const toCity =
            journeyCities.length > 0
              ? `${journeyCities.map((c) => c.label).join(' → ')} → ${depot.name}`
              : unmatchedDestinationLabel(journeyFarLat, journeyFarLon, journeyFarRegion);
          await prisma.routeLog.create({
            data: {
              truckId: truck.id,
              fromCity: depot.name,
              toCity,
              distanceKm: rounded,
              date: journeyStartedAt,
              source: 'auto',
              // Виїзд і так повністю пересоздається (deleteMany + create на початку функції),
              // тож stops завжди пишуться "з нуля" разом з ним — окремо чистити не потрібно.
              stops: {
                create: journeyCities.map((c, i) => ({ seq: i, label: c.label, lat: c.lat, lon: c.lon })),
              },
            },
          });
          journeyCount++;
        }
      }
      traveling = false;
      unknownStart = false;
      journeyDistanceKm = 0;
      journeyCities = [];
      journeyFarLat = null;
      journeyFarLon = null;
      journeyFarRegion = null;
      journeyStartedAt = null;
    }
  }

  if (journeyCount > 0) {
    console.log(`[routes] ${truck.plate}: ${legs.length} відрізків Wialon → ${journeyCount} виїзд(и) записано`);
  }
  return journeyCount;
}

// Обгортка для всіх ТЗ однієї компанії — кожен обробляється окремо через try/catch (див.
// коментар вище), тож збій одного Wialon-звіту не зупиняє синхронізацію для решти флоту.
async function syncRoutesForCompany(config: CompanyWialonConfig, client: WialonClient, days: number) {
  await client.login();
  const trucks = await prisma.truck.findMany({ where: { companyId: config.companyId, wialonUnitId: { not: null } } });
  const to = new Date();
  // Межа "from" прив'язана до початку доби, а не до точної миті "зараз мінус N днів" — інакше
  // вона повільно сповзає вперед з кожним запуском (крон щогодини) і рано чи пізно "переповзає"
  // повз дату вже створеного запису. Wialon по-різному визначає точний момент старту того
  // самого реального виїзду між запитами (спостережений дрейф — до ~1.5 год), тож коли межа
  // проповзає між двома такими версіями одного виїзду, стара версія випадає з вікна видалення
  // і лишається сиротою поруч із щойно перествореною — звідси дублікати того самого рейсу.
  // Прив'язка до початку доби дає стабільну межу впродовж усієї доби незалежно від того, о
  // котрій годині спрацював крон.
  const from = startOfDay(new Date(to.getTime() - days * 86400000));
  const depot = { lat: config.depotLat, lon: config.depotLon, radiusKm: config.depotRadiusKm, name: config.depotName };

  let createdTotal = 0;
  for (const truck of trucks) {
    try {
      createdTotal += await syncRoutesForTruck(truck, from, to, client, depot);
    } catch (err) {
      console.error(`[routes] помилка для ${truck.plate}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[routes] ${config.companyId}: готово ${createdTotal} нових записів RouteLog за останні ${days} днів`);
}

// ---- Оркестрація по всіх (або одній — --company-id) активних компаніях ----
// Кожна компанія обробляється в своєму try/catch: недійсний токен чи збій Wialon в одного
// клієнта не має зупиняти синхронізацію решти — так само, як один поганий ТЗ не зупиняв
// синхронізацію решти флоту в попередній, однокомпанійній версії.

async function forEachCompany(
  label: string,
  companyIdFilter: string | undefined,
  task: (config: CompanyWialonConfig, client: WialonClient) => Promise<void>,
) {
  const configs = await loadConfigs(companyIdFilter);
  if (configs.length === 0) {
    console.log(`[${label}] немає активних CompanyWialonConfig${companyIdFilter ? ` для ${companyIdFilter}` : ''}`);
    return;
  }
  for (const config of configs) {
    try {
      await task(config, clientFor(config));
    } catch (err) {
      console.error(`[${label}] помилка для компанії ${config.companyId}:`, err instanceof Error ? err.message : err);
    }
  }
}

const syncOnceAll = (companyId?: string) => forEachCompany('sync', companyId, syncOnceForCompany);
const syncMileageAll = (companyId?: string) => forEachCompany('mileage', companyId, syncMileageForCompany);
const importDriversAll = (companyId?: string) => forEachCompany('drivers', companyId, importDriversForCompany);
const syncRoutesAll = (days: number, companyId?: string) =>
  forEachCompany('routes', companyId, (config, client) => syncRoutesForCompany(config, client, days));

function argCompanyId(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--company-id='));
  return arg ? arg.slice('--company-id='.length) : undefined;
}

const runOnce = process.argv.includes('--once');
const runMileageOnce = process.argv.includes('--mileage-once');
const runImportDriversOnce = process.argv.includes('--import-drivers-once');
const runBackfillRoutesOnce = process.argv.includes('--backfill-routes-once');
const companyIdArg = argCompanyId();

if (runImportDriversOnce) {
  importDriversAll(companyIdArg)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[drivers] помилка:', err);
      process.exit(1);
    });
} else if (runBackfillRoutesOnce) {
  // Глибокий одноразовий бекфіл (напр. після додавання нового ТЗ чи для перевірки давнішого
  // періоду) — довгий діапазон, за замовчуванням 30 днів. --company-id=... обмежує одним
  // клієнтом (напр. щойно доданим), без потреби чекати повний крон-цикл для решти.
  const days = Number(process.env.BACKFILL_ROUTE_DAYS ?? 30);
  syncRoutesAll(days, companyIdArg)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[routes] помилка:', err);
      process.exit(1);
    });
} else if (runMileageOnce) {
  syncMileageAll(companyIdArg)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[mileage] помилка:', err);
      process.exit(1);
    });
} else if (runOnce) {
  syncOnceAll(companyIdArg)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[sync] помилка:', err);
      process.exit(1);
    });
} else {
  // Постійний режим — жоден з періодичних викликів не має впасти необробленим: інакше одна
  // мережева помилка (Wialon чи Postgres) вбиває весь довгоживучий процес разом з live-синком
  // позицій усіх компаній. forEachCompany уже стійка per-компанія всередині (див. коментар
  // вище), але помилка до цього циклу (напр. сам prisma.companyWialonConfig.findMany) —
  // усе одно ловимо тут, щоб наступний такт крону просто спробував ще раз.
  const safe = (label: string, fn: () => Promise<void>) => () =>
    fn().catch((err) => console.error(`[${label}] необроблена помилка:`, err instanceof Error ? err.message : err));

  const runSyncOnce = safe('sync', () => syncOnceAll());
  const runMileage = safe('mileage', () => syncMileageAll());
  const runRoutes = safe('routes', () => syncRoutesAll(3));

  // позиція/статус — раз на 15 хв (docs/wialon-integration-plan.md розділ 1.4);
  // звіт з пробігом — раз на годину (важчий виклик, ~15с на весь парк);
  // маршрути — раз на годину, короткий rolling-window (3 дні) — ловить щойно завершені
  // виїзди й підстраховує пропущені такти без потреби тримати стан живого виїзду в БД.
  // Усі три тепер обходять усіх активних клієнтів платформи за один такт, не лише одного.
  cron.schedule('*/15 * * * *', runSyncOnce);
  cron.schedule('0 * * * *', runMileage);
  cron.schedule('30 * * * *', runRoutes);
  runSyncOnce();
  runMileage();
  runRoutes();
}
