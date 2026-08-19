import 'dotenv/config';
import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import { trucksRouter } from './routes/trucks';
import { authRouter } from './routes/auth';
import { maintenanceTypesRouter } from './routes/maintenanceTypes';
import { driversRouter } from './routes/drivers';
import { repairsRouter } from './routes/repairs';
import { maintenanceLogsRouter } from './routes/maintenanceLogs';
import { routeLogsRouter } from './routes/routeLogs';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/trucks', trucksRouter);
app.use('/api/maintenance-types', maintenanceTypesRouter);
app.use('/api/drivers', driversRouter);
app.use('/api/repairs', repairsRouter);
app.use('/api/maintenance-logs', maintenanceLogsRouter);
app.use('/api/route-logs', routeLogsRouter);
// TODO: /api/users, /api/notifications

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Запобіжник: будь-яка необроблена помилка в роуті (Prisma чи інша) повертає 500,
// а не валить увесь процес — без цього одна погана відповідь БД клала весь сервер.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Внутрішня помилка сервера' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Transpak Fleet API on :${port}`));
