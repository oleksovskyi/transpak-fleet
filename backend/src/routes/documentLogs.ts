import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const documentLogsRouter = Router();

// Позначити документ оформленим/продовженим: пише історію (DocumentLog) і оновлює
// поточний стан (TruckDocumentStatus) — саме на нього спираються розрахунки статусів
// на Дашборді і в Документах й дозволах.
documentLogsRouter.post('/', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { truckId, documentTypeId, costUah, notes } = req.body;
  if (!truckId || typeof truckId !== 'string') {
    return res.status(400).json({ error: 'Оберіть ТЗ' });
  }
  if (!documentTypeId || typeof documentTypeId !== 'string') {
    return res.status(400).json({ error: 'Оберіть вид документа' });
  }

  const truck = await prisma.truck.findFirst({ where: { id: truckId, companyId: req.user!.companyId } });
  if (!truck) return res.status(404).json({ error: 'ТЗ не знайдено' });

  const documentType = await prisma.documentType.findFirst({
    where: { id: documentTypeId, companyId: req.user!.companyId },
  });
  if (!documentType) return res.status(400).json({ error: 'Такого виду документа не існує' });

  // Опційна задня дата — для внесення реальної історії оформлень (яке зроблено раніше,
  // не сьогодні). Без цього поля поведінка як раніше: "оформлено щойно".
  const { issuedAtDate: rawDate } = req.body;
  if (rawDate !== undefined && rawDate !== null && Number.isNaN(new Date(rawDate).getTime())) {
    return res.status(400).json({ error: 'Некоректна дата оформлення' });
  }

  const performedByUser = req.user ? await prisma.user.findUnique({ where: { id: req.user.id } }) : null;
  const issuedAtDate = rawDate ? new Date(rawDate) : new Date();

  try {
    await prisma.$transaction([
      prisma.documentLog.create({
        data: {
          truckId,
          documentTypeId,
          issuedAtDate,
          performedBy: performedByUser?.email ?? null,
          costUah: costUah ?? null,
          notes: notes ?? null,
        },
      }),
      prisma.truckDocumentStatus.upsert({
        where: { truckId_documentTypeId: { truckId, documentTypeId } },
        update: { lastIssuedAtDate: issuedAtDate },
        create: { truckId, documentTypeId, lastIssuedAtDate: issuedAtDate },
      }),
    ]);

    const updatedTruck = await prisma.truck.findUnique({
      where: { id: truckId },
      include: {
        driver: true,
        maintenanceStatuses: { include: { maintenanceType: true } },
        overrides: { include: { maintenanceType: true } },
        documentStatuses: { include: { documentType: true } },
        documentOverrides: { include: { documentType: true } },
      },
    });
    res.status(201).json(updatedTruck);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(400).json({ error: 'Такого виду документа не існує' });
    }
    throw err;
  }
});
