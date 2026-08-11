import 'dotenv/config';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { login, getUnits } from './wialonClient';

const prisma = new PrismaClient();

async function syncOnce() {
  await login();
  const units = await getUnits();

  for (const unit of units) {
    const truck = await prisma.truck.findUnique({ where: { wialonUnitId: unit.wialonUnitId } });
    if (!truck) continue; // ТЗ ще не прив'язано до Wialon unit в адмінці

    await prisma.truck.update({
      where: { id: truck.id },
      data: {
        totalMileageKm: unit.odometerKm,
        status: unit.isMoving ? 'trip' : truck.status === 'repair' ? 'repair' : 'free',
      },
    });

    await prisma.mileageLog.upsert({
      where: { truckId_date: { truckId: truck.id, date: startOfDay(new Date()) } },
      update: { km: unit.odometerKm },
      create: { truckId: truck.id, date: startOfDay(new Date()), km: unit.odometerKm },
    });

    // TODO: генерація сповіщень (maintenance_soon / maintenance_overdue) —
    // порівняти unit.odometerKm з truck_maintenance_status + maintenance_type.interval_km
  }

  console.log(`[sync] оновлено ${units.length} ТЗ, ${new Date().toISOString()}`);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// раз на 15 хв — див. docs/wialon-integration-plan.md розділ 1.4
cron.schedule('*/15 * * * *', syncOnce);
syncOnce();
