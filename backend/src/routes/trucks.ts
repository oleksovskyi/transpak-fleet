import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const prisma = new PrismaClient();
export const trucksRouter = Router();

// Читання доступне і admin, і viewer
trucksRouter.get('/', requireAuth, async (_req, res) => {
  const trucks = await prisma.truck.findMany({
    include: {
      driver: true,
      maintenanceStatuses: { include: { maintenanceType: true } },
      overrides: { include: { maintenanceType: true } },
    },
  });
  res.json(trucks);
});

trucksRouter.get('/:id', requireAuth, async (req, res) => {
  const truck = await prisma.truck.findUnique({
    where: { id: req.params.id },
    include: {
      driver: true,
      maintenanceStatuses: { include: { maintenanceType: true } },
      overrides: { include: { maintenanceType: true } },
      repairs: true,
    },
  });
  if (!truck) return res.status(404).json({ error: 'ТЗ не знайдено' });
  res.json(truck);
});

// Мутуючі ендпоінти — лише admin (TODO: реалізувати update/delete аналогічно)
trucksRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { plate, model, wialonUnitId, fuelNormL100km } = req.body;
  if (!plate || typeof plate !== 'string' || !plate.trim()) {
    return res.status(400).json({ error: 'Вкажіть держ. номер' });
  }
  if (!model || typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'Вкажіть модель' });
  }

  try {
    const truck = await prisma.truck.create({
      data: {
        plate: plate.trim(),
        model: model.trim(),
        wialonUnitId: wialonUnitId || null,
        fuelNormL100km: fuelNormL100km ?? null,
      },
    });
    res.status(201).json(truck);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const field = (err.meta?.target as string[] | undefined)?.[0];
      const message =
        field === 'wialonUnitId'
          ? 'ТЗ із таким Wialon unit ID вже існує'
          : 'ТЗ із таким держ. номером вже існує';
      return res.status(409).json({ error: message });
    }
    throw err;
  }
});

// Часткове оновлення ТЗ: plate/model/fuelNormL100km/wialonUnitId/driverId — усі опційні,
// застосовується лише те, що прийшло в тілі запиту (щоб один PATCH не затирав інші поля).
trucksRouter.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { plate, model, fuelNormL100km, wialonUnitId, driverId, totalMileageKm } = req.body;

  if (plate !== undefined && (typeof plate !== 'string' || !plate.trim())) {
    return res.status(400).json({ error: 'Держ. номер не може бути порожнім' });
  }
  if (model !== undefined && (typeof model !== 'string' || !model.trim())) {
    return res.status(400).json({ error: 'Модель не може бути порожньою' });
  }
  if (totalMileageKm !== undefined && (typeof totalMileageKm !== 'number' || totalMileageKm < 0)) {
    return res.status(400).json({ error: 'Пробіг має бути невід’ємним числом' });
  }

  try {
    // Один водій — одне ТЗ: якщо призначаємо водія, що вже закріплений за іншим ТЗ,
    // спершу знімаємо його звідти — це і є "перепризначення", а не дублювання.
    if (driverId) {
      await prisma.truck.updateMany({
        where: { driverId, NOT: { id: req.params.id } },
        data: { driverId: null },
      });
    }

    const truck = await prisma.truck.update({
      where: { id: req.params.id },
      data: {
        ...(plate !== undefined ? { plate: plate.trim() } : {}),
        ...(model !== undefined ? { model: model.trim() } : {}),
        ...(fuelNormL100km !== undefined ? { fuelNormL100km: fuelNormL100km ?? null } : {}),
        ...(wialonUnitId !== undefined ? { wialonUnitId: wialonUnitId || null } : {}),
        ...(driverId !== undefined ? { driverId: driverId ?? null } : {}),
        // Ручний ввід пробігу = нове калібрування: фіксуємо базу і момент часу, від якого
        // sync-service рахуватиме наліт з Wialon-звітів до наступного ручного вводу.
        ...(totalMileageKm !== undefined
          ? { totalMileageKm, mileageBaselineKm: totalMileageKm, mileageBaselineAt: new Date() }
          : {}),
      },
      include: {
        driver: true,
        maintenanceStatuses: { include: { maintenanceType: true } },
        overrides: { include: { maintenanceType: true } },
      },
    });
    res.json(truck);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'ТЗ не знайдено' });
      if (err.code === 'P2003') return res.status(400).json({ error: 'Такого водія не існує' });
      if (err.code === 'P2002') {
        const field = (err.meta?.target as string[] | undefined)?.[0];
        const message =
          field === 'wialonUnitId' ? 'ТЗ із таким Wialon unit ID вже існує' : 'ТЗ із таким держ. номером вже існує';
        return res.status(409).json({ error: message });
      }
    }
    throw err;
  }
});

// Індивідуальний виняток інтервалу для пари (ТЗ, вид робіт) — лише якщо
// MaintenanceType.allowOverride === true (перемикач у Налаштуваннях). Upsert за складеним
// унікальним ключем truckId+maintenanceTypeId — не потрібно знати id самого запису.
trucksRouter.put('/:truckId/maintenance-overrides/:maintenanceTypeId', requireAuth, requireAdmin, async (req, res) => {
  const { truckId, maintenanceTypeId } = req.params;
  const { overrideIntervalKm, overrideIntervalDays } = req.body;

  if (overrideIntervalKm == null && overrideIntervalDays == null) {
    return res.status(400).json({ error: 'Вкажіть хоча б один інтервал — км або дні' });
  }

  const type = await prisma.maintenanceType.findUnique({ where: { id: maintenanceTypeId } });
  if (!type) return res.status(404).json({ error: 'Вид робіт не знайдено' });
  if (!type.allowOverride) {
    return res.status(403).json({ error: 'Для цього виду робіт винятки заборонені в Налаштуваннях' });
  }

  try {
    const override = await prisma.truckMaintenanceOverride.upsert({
      where: { truckId_maintenanceTypeId: { truckId, maintenanceTypeId } },
      update: { overrideIntervalKm: overrideIntervalKm ?? null, overrideIntervalDays: overrideIntervalDays ?? null },
      create: {
        truckId,
        maintenanceTypeId,
        overrideIntervalKm: overrideIntervalKm ?? null,
        overrideIntervalDays: overrideIntervalDays ?? null,
      },
      include: { maintenanceType: true },
    });
    res.json(override);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(400).json({ error: 'Такого ТЗ не існує' });
    }
    throw err;
  }
});

trucksRouter.delete('/:truckId/maintenance-overrides/:maintenanceTypeId', requireAuth, requireAdmin, async (req, res) => {
  const { truckId, maintenanceTypeId } = req.params;
  try {
    await prisma.truckMaintenanceOverride.delete({
      where: { truckId_maintenanceTypeId: { truckId, maintenanceTypeId } },
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Винятку не знайдено' });
    }
    throw err;
  }
});
