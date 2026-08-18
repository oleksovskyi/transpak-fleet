import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const prisma = new PrismaClient();
export const driversRouter = Router();

// Читання доступне і admin, і viewer
driversRouter.get('/', requireAuth, async (_req, res) => {
  const drivers = await prisma.driver.findMany({
    orderBy: { fullName: 'asc' },
    include: { trucks: { select: { id: true, plate: true, status: true } } },
  });
  res.json(drivers);
});

// Мутуючі ендпоінти — лише admin
driversRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { fullName, experienceYears } = req.body;
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ error: "Вкажіть ім'я водія" });
  }
  const driver = await prisma.driver.create({
    data: { fullName: fullName.trim(), experienceYears: experienceYears ?? null },
  });
  res.status(201).json({ ...driver, trucks: [] });
});

driversRouter.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { fullName, experienceYears } = req.body;
  try {
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: {
        ...(fullName !== undefined ? { fullName } : {}),
        ...(experienceYears !== undefined ? { experienceYears } : {}),
      },
      include: { trucks: { select: { id: true, plate: true, status: true } } },
    });
    res.json(driver);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Водія не знайдено' });
    }
    throw err;
  }
});

// Видалення безпечне: у Truck.driverId стоїть ON DELETE SET NULL — закріплені ТЗ
// просто втратять водія, без помилки цілісності.
driversRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.driver.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Водія не знайдено' });
    }
    throw err;
  }
});
