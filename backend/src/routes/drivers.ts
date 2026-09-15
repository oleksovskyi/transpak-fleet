import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const driversRouter = Router();

// Читання доступне і admin, і viewer
driversRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const drivers = await prisma.driver.findMany({
    where: { companyId: req.user!.companyId },
    orderBy: { fullName: 'asc' },
    include: { trucks: { select: { id: true, plate: true, status: true } } },
  });
  res.json(drivers);
});

// Мутуючі ендпоінти — лише admin
driversRouter.post('/', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { fullName, experienceYears } = req.body;
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ error: "Вкажіть ім'я водія" });
  }
  const driver = await prisma.driver.create({
    data: { companyId: req.user!.companyId, fullName: fullName.trim(), experienceYears: experienceYears ?? null },
  });
  res.status(201).json({ ...driver, trucks: [] });
});

driversRouter.patch('/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { fullName, experienceYears } = req.body;
  const existing = await prisma.driver.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
  if (!existing) return res.status(404).json({ error: 'Водія не знайдено' });

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
driversRouter.delete('/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const existing = await prisma.driver.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
  if (!existing) return res.status(404).json({ error: 'Водія не знайдено' });

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
