import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';

export interface AuthedRequest extends Request {
  user?: { id: string; role: 'admin' | 'viewer'; companyId: string };
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Немає токена авторизації' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as {
      id: string;
      role: 'admin' | 'viewer';
      companyId: string;
    };
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Недійсний або прострочений токен' });
  }
}

// Використовувати на кожному мутуючому ендпоінті (POST/PUT/DELETE).
// Перевірка на бекенді обов'язкова — приховування кнопок на фронтенді це лише UX.
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Дія доступна лише адміністратору' });
  }
  next();
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Різна довжина сигналізує "не збігається" ще до timingSafeEqual (яка вимагає
  // однакової довжини буферів) — сама ця перевірка не витікає корисної інформації
  // про секрет, бо довжина очікуваного ключа й так не таємниця.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Окремий рівень довіри від User.role: не прив'язаний до жодної конкретної компанії,
// призначений виключно для онбордингу нових клієнтів платформи (POST /api/platform/*)
// з довіреної машини оператора платформи, без прямого доступу до продової БД.
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PLATFORM_ADMIN_KEY;
  if (!expected) {
    return res.status(500).json({ error: 'PLATFORM_ADMIN_KEY не налаштовано на сервері' });
  }
  const provided = req.headers['x-platform-key'];
  if (typeof provided !== 'string' || !safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Недійсний платформний ключ' });
  }
  next();
}
