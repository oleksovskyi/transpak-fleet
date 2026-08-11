import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { trucksRouter } from './routes/trucks';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/trucks', trucksRouter);
// TODO: /api/auth, /api/maintenance-types, /api/repairs, /api/drivers, /api/users, /api/notifications

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Transpak Fleet API on :${port}`));
