import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const documentTypesRouter = Router();

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яіїєё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'doc-type'}-${Date.now()}`;
}

// Довідник читають і admin, і viewer
documentTypesRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const types = await prisma.documentType.findMany({
    where: { companyId: req.user!.companyId },
    orderBy: { name: 'asc' },
  });
  res.json(types);
});

// Створення/редагування/видалення — лише admin (перевірка ролі обов'язкова на бекенді)
documentTypesRouter.post('/', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { name, intervalDays, soonDays, allowOverride } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Вкажіть назву документа' });
  }
  if (intervalDays == null || typeof intervalDays !== 'number' || intervalDays <= 0) {
    return res.status(400).json({ error: 'Вкажіть термін дії документа, днів' });
  }

  const type = await prisma.documentType.create({
    data: {
      companyId: req.user!.companyId,
      key: slugify(name),
      name: name.trim(),
      intervalDays,
      soonDays: soonDays ?? 0,
      allowOverride: allowOverride ?? true,
    },
  });
  res.status(201).json(type);
});

documentTypesRouter.patch('/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { name, intervalDays, soonDays, allowOverride } = req.body;

  const existing = await prisma.documentType.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!existing) return res.status(404).json({ error: 'Вид документа не знайдено' });

  try {
    const type = await prisma.documentType.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(intervalDays !== undefined ? { intervalDays } : {}),
        ...(soonDays !== undefined ? { soonDays } : {}),
        ...(allowOverride !== undefined ? { allowOverride } : {}),
      },
    });
    res.json(type);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Вид документа не знайдено' });
    }
    throw err;
  }
});

documentTypesRouter.delete('/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const existing = await prisma.documentType.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!existing) return res.status(404).json({ error: 'Вид документа не знайдено' });

  try {
    await prisma.documentType.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Вид документа не знайдено' });
      if (err.code === 'P2003') {
        return res.status(409).json({ error: 'Не можна видалити вид документа, який вже використовується по ТЗ' });
      }
    }
    // Postgres іноді повертає RESTRICT-порушення (23001) замість типового foreign-key
    // коду (23503), який Prisma розпізнає як P2003 — тоді це PrismaClientUnknownRequestError,
    // ловимо за текстом повідомлення, щоб не падати з 500 на легітимний бізнес-кейс.
    if (err instanceof Error && /foreign key constraint/i.test(err.message)) {
      return res.status(409).json({ error: 'Не можна видалити вид документа, який вже використовується по ТЗ' });
    }
    throw err;
  }
});
