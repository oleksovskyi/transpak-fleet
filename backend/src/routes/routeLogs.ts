import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const routeLogsRouter = Router();

// Читання доступне і admin, і viewer
routeLogsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const logs = await prisma.routeLog.findMany({
    where: { truck: { companyId: req.user!.companyId } },
    orderBy: { date: 'desc' },
    include: {
      truck: { select: { id: true, plate: true, model: true } },
      stops: { orderBy: { seq: 'asc' } },
    },
  });
  res.json(logs);
});

// Мутуючі ендпоінти — лише admin
routeLogsRouter.post('/', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { truckId, fromCity, toCity, distanceKm, date } = req.body;

  if (!truckId || typeof truckId !== 'string') {
    return res.status(400).json({ error: 'Оберіть ТЗ' });
  }
  if (!fromCity || typeof fromCity !== 'string' || !fromCity.trim()) {
    return res.status(400).json({ error: 'Вкажіть пункт відправлення' });
  }
  if (!toCity || typeof toCity !== 'string' || !toCity.trim()) {
    return res.status(400).json({ error: 'Вкажіть пункт призначення' });
  }
  if (distanceKm == null || typeof distanceKm !== 'number' || distanceKm <= 0) {
    return res.status(400).json({ error: 'Вкажіть відстань (км), більшу за 0' });
  }

  const truck = await prisma.truck.findFirst({ where: { id: truckId, companyId: req.user!.companyId } });
  if (!truck) return res.status(400).json({ error: 'Такого ТЗ не існує' });

  try {
    const log = await prisma.routeLog.create({
      data: {
        truckId,
        fromCity: fromCity.trim(),
        toCity: toCity.trim(),
        distanceKm,
        ...(date ? { date: new Date(date) } : {}),
      },
      include: { truck: { select: { id: true, plate: true, model: true } } },
    });
    res.status(201).json(log);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(400).json({ error: 'Такого ТЗ не існує' });
    }
    throw err;
  }
});

routeLogsRouter.delete('/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const existing = await prisma.routeLog.findFirst({
    where: { id: req.params.id, truck: { companyId: req.user!.companyId } },
  });
  if (!existing) return res.status(404).json({ error: 'Запис не знайдено' });

  try {
    await prisma.routeLog.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Запис не знайдено' });
    }
    throw err;
  }
});
