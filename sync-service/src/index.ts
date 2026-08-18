import 'dotenv/config';
import cron from 'node-cron';
import { PrismaClient } from './prisma';
import { login, getUnits, getTripMileageKm, distanceKm, getDrivers } from './wialonClient';

const prisma = new PrismaClient();

// Геозона бази: ТЗ вважається "на базі" (готовий до нового рейсу), лише якщо фізично
// поруч із депо — рух тут ролі не грає. Якщо ТЗ стоїть, але далеко (напр. ночує в рейсі) —
// це все одно "В рейсі", а не "Вільний".
const DEPOT_LAT = Number(process.env.DEPOT_LAT ?? 49.3295);
const DEPOT_LON = Number(process.env.DEPOT_LON ?? 24.0915);
const DEPOT_RADIUS_KM = Number(process.env.DEPOT_RADIUS_KM ?? 2);

async function syncOnce() {
  await login();
  const units = await getUnits();

  let matched = 0;
  for (const unit of units) {
    const truck = await prisma.truck.findUnique({ where: { wialonUnitId: unit.wialonUnitId } });
    if (!truck) continue; // ТЗ ще не прив'язано до Wialon unit в адмінці
    matched++;

    // Wialon-лічильник 0 означає "не відкалібровано", а не "реально 0 км" — не затираємо
    // ані сам пробіг (може бути введений адміном вручну), ані пишемо фейковий MileageLog.
    const hasRealOdometer = unit.odometerKm > 0;
    const atBase = distanceKm(unit.lat, unit.lon, DEPOT_LAT, DEPOT_LON) <= DEPOT_RADIUS_KM;

    await prisma.truck.update({
      where: { id: truck.id },
      data: {
        ...(hasRealOdometer ? { totalMileageKm: unit.odometerKm } : {}),
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

  console.log(`[sync] Wialon: ${units.length} unit(s), прив'язано й оновлено: ${matched} ТЗ, ${new Date().toISOString()}`);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// "Калібрування" пробігу: для ТЗ, де адмін хоч раз вручну ввів пробіг (mileageBaselineAt
// заданий), рахуємо totalMileageKm = mileageBaselineKm + пробіг у поїздках за офіційним
// Wialon-звітом від mileageBaselineAt до зараз. ТЗ без калібрування цей крок не чіпає.
async function syncMileageFromReports() {
  await login();
  const trucks = await prisma.truck.findMany({
    where: { wialonUnitId: { not: null }, mileageBaselineAt: { not: null } },
  });

  const now = new Date();
  let updated = 0;
  for (const truck of trucks) {
    try {
      const deltaKm = await getTripMileageKm(truck.wialonUnitId!, truck.mileageBaselineAt!, now);
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
  console.log(`[mileage] оновлено пробіг для ${updated} з ${trucks.length} відкаліброваних ТЗ, ${now.toISOString()}`);
}

// Одноразовий імпорт водіїв із Wialon (npm run import-drivers). Не чіпає ТЗ, які вже мають
// закріпленого водія вручну — щоб нічого не перезаписати; так само пропускає водіїв,
// які вже є в базі (за збігом імені), щоб повторний запуск не плодив дублікатів.
async function importDriversOnce() {
  await login();
  const wialonDrivers = await getDrivers();

  let created = 0;
  let skipped = 0;
  let assigned = 0;
  for (const wd of wialonDrivers) {
    const existing = await prisma.driver.findFirst({ where: { fullName: wd.fullName } });
    if (existing) {
      skipped++;
      console.log(`[drivers] "${wd.fullName}" вже існує — пропущено`);
      continue;
    }

    const driver = await prisma.driver.create({ data: { fullName: wd.fullName } });
    created++;

    if (!wd.boundWialonUnitId) {
      console.log(`[drivers] "${wd.fullName}" створено, без прив'язки до ТЗ`);
      continue;
    }
    const truck = await prisma.truck.findUnique({ where: { wialonUnitId: wd.boundWialonUnitId } });
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
    `[drivers] з Wialon: ${wialonDrivers.length}, створено: ${created}, вже існували: ${skipped}, закріплено за ТЗ: ${assigned}`,
  );
}

const runOnce = process.argv.includes('--once');
const runMileageOnce = process.argv.includes('--mileage-once');
const runImportDriversOnce = process.argv.includes('--import-drivers-once');

if (runImportDriversOnce) {
  importDriversOnce()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[drivers] помилка:', err);
      process.exit(1);
    });
} else if (runMileageOnce) {
  syncMileageFromReports()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[mileage] помилка:', err);
      process.exit(1);
    });
} else if (runOnce) {
  syncOnce()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[sync] помилка:', err);
      process.exit(1);
    });
} else {
  // позиція/статус — раз на 15 хв (docs/wialon-integration-plan.md розділ 1.4);
  // звіт з пробігом — раз на годину (важчий виклик, ~15с на весь парк)
  cron.schedule('*/15 * * * *', syncOnce);
  cron.schedule('0 * * * *', syncMileageFromReports);
  syncOnce();
  syncMileageFromReports();
}
