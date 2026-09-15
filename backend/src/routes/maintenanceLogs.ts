import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const maintenanceLogsRouter = Router();

// Позначити позицію регламенту виконаною: пише історію (MaintenanceLog) і оновлює
// поточний стан (TruckMaintenanceStatus) — саме на нього спираються розрахунки статусів
// на Дашборді, в Автопарку і тут.
maintenanceLogsRouter.post('/', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { truckId, maintenanceTypeId, costUah, notes } = req.body;
  if (!truckId || typeof truckId !== 'string') {
    return res.status(400).json({ error: 'Оберіть ТЗ' });
  }
  if (!maintenanceTypeId || typeof maintenanceTypeId !== 'string') {
    return res.status(400).json({ error: 'Оберіть вид робіт' });
  }

  const truck = await prisma.truck.findFirst({ where: { id: truckId, companyId: req.user!.companyId } });
  if (!truck) return res.status(404).json({ error: 'ТЗ не знайдено' });

  const maintenanceType = await prisma.maintenanceType.findFirst({
    where: { id: maintenanceTypeId, companyId: req.user!.companyId },
  });
  if (!maintenanceType) return res.status(400).json({ error: 'Такого виду робіт не існує' });

  // Опційне заднє число — для внесення реальної історії ТО (яке зроблено раніше,
  // не сьогодні на поточному пробігу). Без цих полів поведінка як раніше:
  // "виконано зараз, на поточному пробігу ТЗ".
  const { performedAtKm: rawKm, performedAtDate: rawDate } = req.body;
  if (rawKm !== undefined && rawKm !== null) {
    if (typeof rawKm !== 'number' || rawKm < 0) {
      return res.status(400).json({ error: 'Пробіг на момент ТО має бути невід’ємним числом' });
    }
    if (rawKm > truck.totalMileageKm) {
      return res.status(400).json({ error: 'Пробіг на момент ТО не може перевищувати поточний пробіг ТЗ' });
    }
  }
  if (rawDate !== undefined && rawDate !== null && Number.isNaN(new Date(rawDate).getTime())) {
    return res.status(400).json({ error: 'Некоректна дата ТО' });
  }

  const performedByUser = req.user ? await prisma.user.findUnique({ where: { id: req.user.id } }) : null;
  const performedAtKm = rawKm ?? truck.totalMileageKm;
  const performedAtDate = rawDate ? new Date(rawDate) : new Date();

  try {
    await prisma.$transaction([
      prisma.maintenanceLog.create({
        data: {
          truckId,
          maintenanceTypeId,
          performedAtKm,
          performedAtDate,
          performedBy: performedByUser?.email ?? null,
          costUah: costUah ?? null,
          notes: notes ?? null,
        },
      }),
      prisma.truckMaintenanceStatus.upsert({
        where: { truckId_maintenanceTypeId: { truckId, maintenanceTypeId } },
        update: { lastDoneAtKm: performedAtKm, lastDoneAtDate: performedAtDate },
        create: { truckId, maintenanceTypeId, lastDoneAtKm: performedAtKm, lastDoneAtDate: performedAtDate },
      }),
    ]);

    const updatedTruck = await prisma.truck.findUnique({
      where: { id: truckId },
      include: {
        driver: true,
        maintenanceStatuses: { include: { maintenanceType: true } },
        overrides: { include: { maintenanceType: true } },
      },
    });
    res.status(201).json(updatedTruck);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(400).json({ error: 'Такого виду робіт не існує' });
    }
    throw err;
  }
});
