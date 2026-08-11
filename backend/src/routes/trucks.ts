import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const prisma = new PrismaClient();
export const trucksRouter = Router();

// Читання доступне і admin, і viewer
trucksRouter.get('/', requireAuth, async (_req, res) => {
  const trucks = await prisma.truck.findMany({
    include: { driver: true, maintenanceStatuses: { include: { maintenanceType: true } } },
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

// Мутуючі ендпоінти — лише admin (TODO: реалізувати create/update/delete аналогічно)
trucksRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { plate, model, wialonUnitId } = req.body;
  const truck = await prisma.truck.create({ data: { plate, model, wialonUnitId } });
  res.status(201).json(truck);
});
