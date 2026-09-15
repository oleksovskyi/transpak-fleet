import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const mileageLogsRouter = Router();

// Читання доступне і admin, і viewer. Дані невеликі (ТЗ × дні від калібрування) — віддаємо
// сирі щоденні знімки одометра, уся агрегація (по водіях/за період) — на фронтенді, як і
// route-logs.
mileageLogsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const logs = await prisma.mileageLog.findMany({
    where: { truck: { companyId: req.user!.companyId } },
    orderBy: { date: 'asc' },
    include: {
      truck: {
        select: {
          id: true,
          plate: true,
          model: true,
          driverId: true,
          driver: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  res.json(logs);
});
