import { Router } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { requirePlatformAdmin } from '../middleware/auth';

const prisma = new PrismaClient();
export const platformRouter = Router();

// Увесь роутер — за платформним ключем (X-Platform-Key), не за звичайним JWT
// користувача: онбординг нового клієнта не має вимагати прямого доступу до продової
// БД з машини оператора платформи, лише цей один секрет.
platformRouter.use(requirePlatformAdmin);

// Список компаній — щоб знайти companyId (напр. для .env sync-service нового клієнта)
// без прямого запиту до БД.
platformRouter.get('/companies', async (_req, res) => {
  const companies = await prisma.company.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(companies);
});

// Створення нового клієнта платформи. Ідемпотентно за назвою — повторний виклик з тією
// самою назвою повертає вже існуючу компанію, а не дублює її.
platformRouter.post('/companies', async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Вкажіть назву компанії' });
  }

  const existing = await prisma.company.findFirst({ where: { name: name.trim() } });
  if (existing) return res.json(existing);

  const company = await prisma.company.create({ data: { name: name.trim() } });
  res.status(201).json(company);
});

// Видалення компанії — навмисно НЕ каскадне: якщо в неї лишились ТЗ/водії/користувачі/
// довідники, відмовляємо з переліком того, що заважає, а не тихо стираємо історію
// реального клієнта. Призначено для прибирання порожніх/тестових компаній; видалення
// компанії з реальними даними — окрема, свідома дія (спершу прибрати їх вручну).
platformRouter.delete('/companies/:id', async (req, res) => {
  const companyId = req.params.id;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return res.status(404).json({ error: 'Компанію не знайдено' });

  const [users, drivers, trucks, maintenanceTypes, documentTypes] = await Promise.all([
    prisma.user.count({ where: { companyId } }),
    prisma.driver.count({ where: { companyId } }),
    prisma.truck.count({ where: { companyId } }),
    prisma.maintenanceType.count({ where: { companyId } }),
    prisma.documentType.count({ where: { companyId } }),
  ]);

  const blockers: string[] = [];
  if (users > 0) blockers.push(`${users} користувач(ів)`);
  if (drivers > 0) blockers.push(`${drivers} водіїв`);
  if (trucks > 0) blockers.push(`${trucks} ТЗ`);
  if (maintenanceTypes > 0) blockers.push(`${maintenanceTypes} видів ТО`);
  if (documentTypes > 0) blockers.push(`${documentTypes} видів документів`);
  if (blockers.length > 0) {
    return res.status(409).json({
      error: `Неможливо видалити — у компанії ще є: ${blockers.join(', ')}. Спершу видаліть це.`,
    });
  }

  // Wialon-конфіг сам по собі не бізнес-дані клієнта (лише креденшели підключення) —
  // прибираємо разом з компанією без окремого запобіжника.
  await prisma.companyWialonConfig.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  res.status(204).end();
});

// Створення/оновлення користувача клієнта — той самий сценарій, що
// backend/scripts/create-user.ts, але по HTTP. companyId обов'язковий і явний
// (спершу POST /companies), щоб typo в назві компанії не створило нового tenant-а
// непомітно для оператора.
platformRouter.post('/users', async (req, res) => {
  const { email, password, role, companyId } = req.body;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Вкажіть email' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Пароль має містити щонайменше 8 символів' });
  }
  if (role !== 'admin' && role !== 'viewer') {
    return res.status(400).json({ error: 'Роль має бути "admin" або "viewer"' });
  }
  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Вкажіть companyId (створіть компанію через POST /api/platform/companies)' });
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return res.status(404).json({ error: 'Компанію не знайдено' });

  const passwordHash = await bcrypt.hash(password, 10);
  // companyId не входить в update — уже існуючого користувача до іншої компанії
  // цей ендпоінт не перекидає, лише пароль/роль.
  const user = await prisma.user.upsert({
    where: { email: email.trim() },
    update: { passwordHash, role: role as Role },
    create: { email: email.trim(), passwordHash, role: role as Role, companyId },
  });

  res.status(201).json({ id: user.id, email: user.email, role: user.role, companyId: user.companyId });
});

// Список користувачів компанії — email/роль/дата створення. passwordHash навмисно не
// повертається: пароль ніде не зберігається у відновлюваному вигляді, лише bcrypt-хеш —
// показати "поточний пароль" фізично неможливо, тільше можна задати новий (POST /users).
platformRouter.get('/companies/:id/users', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) return res.status(404).json({ error: 'Компанію не знайдено' });

  const users = await prisma.user.findMany({
    where: { companyId: req.params.id },
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
});

// Видалення користувача. Прибираємо і його Notification (реальна FK-залежність — без
// цього delete впав би з порушенням зовнішнього ключа); MaintenanceLog/DocumentLog
// зберігають лише email як текст (не FK), тож історія ТО/документів лишається цілою.
platformRouter.delete('/companies/:id/users/:userId', async (req, res) => {
  const { id: companyId, userId } = req.params;
  const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });

  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  res.status(204).end();
});

// Wialon-креденшели й налаштування депо компанії — те, що раніше було .env для окремого
// деплою sync-service на клієнта. Тепер sync-service (один процес для всіх клієнтів)
// читає ці рядки з БД у кожному циклі синхронізації.
platformRouter.get('/companies/:id/wialon-config', async (req, res) => {
  const config = await prisma.companyWialonConfig.findUnique({ where: { companyId: req.params.id } });
  if (!config) return res.status(404).json({ error: 'Wialon-конфіг для цієї компанії не задано' });
  res.json(config);
});

// Upsert — один виклик і для першого налаштування нового клієнта, і для зміни токена/депо.
platformRouter.put('/companies/:id/wialon-config', async (req, res) => {
  const companyId = req.params.id;
  const {
    wialonToken,
    wialonBaseUrl,
    depotLat,
    depotLon,
    depotRadiusKm,
    depotName,
    wialonReportResourceId,
    wialonReportTemplateId,
    wialonDriversResourceId,
    enabled,
  } = req.body;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return res.status(404).json({ error: 'Компанію не знайдено' });

  if (!wialonToken || typeof wialonToken !== 'string' || !wialonToken.trim()) {
    return res.status(400).json({ error: 'Вкажіть Wialon token' });
  }
  if (typeof depotLat !== 'number' || typeof depotLon !== 'number' || typeof depotRadiusKm !== 'number') {
    return res.status(400).json({ error: 'depotLat/depotLon/depotRadiusKm мають бути числами' });
  }
  if (!depotName || typeof depotName !== 'string' || !depotName.trim()) {
    return res.status(400).json({ error: 'Вкажіть depotName' });
  }
  if (typeof wialonReportResourceId !== 'number' || typeof wialonReportTemplateId !== 'number') {
    return res.status(400).json({ error: 'wialonReportResourceId/wialonReportTemplateId мають бути числами' });
  }

  const data = {
    wialonToken: wialonToken.trim(),
    wialonBaseUrl: wialonBaseUrl || null,
    depotLat,
    depotLon,
    depotRadiusKm,
    depotName: depotName.trim(),
    wialonReportResourceId,
    wialonReportTemplateId,
    wialonDriversResourceId: wialonDriversResourceId ?? null,
    enabled: enabled ?? true,
  };

  const config = await prisma.companyWialonConfig.upsert({
    where: { companyId },
    update: data,
    create: { companyId, ...data },
  });
  res.json(config);
});
