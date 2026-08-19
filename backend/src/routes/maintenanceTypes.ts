import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const prisma = new PrismaClient();
export const maintenanceTypesRouter = Router();

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яіїєё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'type'}-${Date.now()}`;
}

// Довідник читають і admin, і viewer
maintenanceTypesRouter.get('/', requireAuth, async (_req, res) => {
  const types = await prisma.maintenanceType.findMany({ orderBy: { name: 'asc' } });
  res.json(types);
});

// Створення/редагування/видалення — лише admin (перевірка ролі обов'язкова на бекенді)
maintenanceTypesRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, intervalKm, intervalDays, soonKm, soonDays, allowOverride } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Вкажіть назву виду робіт' });
  }
  if (intervalKm == null && intervalDays == null) {
    return res.status(400).json({ error: 'Вкажіть хоча б один інтервал — у км або днях' });
  }

  const type = await prisma.maintenanceType.create({
    data: {
      key: slugify(name),
      name: name.trim(),
      intervalKm: intervalKm ?? null,
      intervalDays: intervalDays ?? null,
      soonKm: soonKm ?? 0,
      soonDays: soonDays ?? 0,
      allowOverride: allowOverride ?? true,
    },
  });
  res.status(201).json(type);
});

maintenanceTypesRouter.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, intervalKm, intervalDays, soonKm, soonDays, allowOverride } = req.body;
  const nextIntervalKm = intervalKm !== undefined ? intervalKm : undefined;
  const nextIntervalDays = intervalDays !== undefined ? intervalDays : undefined;

  try {
    const type = await prisma.maintenanceType.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(nextIntervalKm !== undefined ? { intervalKm: nextIntervalKm } : {}),
        ...(nextIntervalDays !== undefined ? { intervalDays: nextIntervalDays } : {}),
        ...(soonKm !== undefined ? { soonKm } : {}),
        ...(soonDays !== undefined ? { soonDays } : {}),
        ...(allowOverride !== undefined ? { allowOverride } : {}),
      },
    });
    res.json(type);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Вид робіт не знайдено' });
    }
    throw err;
  }
});

maintenanceTypesRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.maintenanceType.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Вид робіт не знайдено' });
      if (err.code === 'P2003') {
        return res.status(409).json({ error: 'Не можна видалити вид робіт, який вже використовується по ТЗ' });
      }
    }
    // Postgres іноді повертає RESTRICT-порушення (23001) замість типового foreign-key
    // коду (23503), який Prisma розпізнає як P2003 — тоді це PrismaClientUnknownRequestError,
    // ловимо за текстом повідомлення, щоб не падати з 500 на легітимний бізнес-кейс.
    if (err instanceof Error && /foreign key constraint/i.test(err.message)) {
      return res.status(409).json({ error: 'Не можна видалити вид робіт, який вже використовується по ТЗ' });
    }
    throw err;
  }
});
