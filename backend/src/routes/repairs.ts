import { Router } from 'express';
import { Prisma, PrismaClient, RepairType } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const prisma = new PrismaClient();
export const repairsRouter = Router();

const REPAIR_TYPES: RepairType[] = ['planned', 'unplanned'];

// Статус ТЗ на Автопарку має відображати активний ремонт: якщо по ТЗ лишається хоч один
// ремонт зі статусом in_progress — ТЗ "в ремонті", інакше — "вільний" (наступна синхронізація
// з Wialon скоригує на "в рейсі", якщо ТЗ фактично рухається).
async function syncTruckRepairStatus(truckId: string) {
  const activeCount = await prisma.repair.count({ where: { truckId, status: 'in_progress' } });
  await prisma.truck.update({
    where: { id: truckId },
    data: { status: activeCount > 0 ? 'repair' : 'free' },
  });
}

// Читання доступне і admin, і viewer
repairsRouter.get('/', requireAuth, async (_req, res) => {
  const repairs = await prisma.repair.findMany({
    orderBy: { date: 'desc' },
    include: { truck: { select: { id: true, plate: true, model: true } } },
  });
  res.json(repairs);
});

// Мутуючі ендпоінти — лише admin
repairsRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { truckId, type, description, date, downtimeDays, costUah } = req.body;

  if (!truckId || typeof truckId !== 'string') {
    return res.status(400).json({ error: 'Оберіть ТЗ' });
  }
  if (!REPAIR_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Тип ремонту має бути "planned" або "unplanned"' });
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Вкажіть опис ремонту' });
  }

  try {
    const repair = await prisma.repair.create({
      data: {
        truckId,
        type,
        description: description.trim(),
        ...(date ? { date: new Date(date) } : {}),
        downtimeDays: downtimeDays ?? null,
        costUah: costUah ?? null,
      },
      include: { truck: { select: { id: true, plate: true, model: true } } },
    });
    await syncTruckRepairStatus(truckId);
    res.status(201).json(repair);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(400).json({ error: 'Такого ТЗ не існує' });
    }
    throw err;
  }
});

repairsRouter.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { type, description, date, downtimeDays, costUah, status } = req.body;
  if (type !== undefined && !REPAIR_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Тип ремонту має бути "planned" або "unplanned"' });
  }
  if (status !== undefined && status !== 'in_progress' && status !== 'done') {
    return res.status(400).json({ error: 'Статус має бути "in_progress" або "done"' });
  }

  try {
    const repair = await prisma.repair.update({
      where: { id: req.params.id },
      data: {
        ...(type !== undefined ? { type } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(date !== undefined ? { date: new Date(date) } : {}),
        ...(downtimeDays !== undefined ? { downtimeDays } : {}),
        ...(costUah !== undefined ? { costUah } : {}),
        ...(status !== undefined ? { status } : {}),
      },
      include: { truck: { select: { id: true, plate: true, model: true } } },
    });
    if (status !== undefined) await syncTruckRepairStatus(repair.truckId);
    res.json(repair);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Ремонт не знайдено' });
    }
    throw err;
  }
});

repairsRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const repair = await prisma.repair.delete({ where: { id: req.params.id } });
    await syncTruckRepairStatus(repair.truckId);
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Ремонт не знайдено' });
    }
    throw err;
  }
});
