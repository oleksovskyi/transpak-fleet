import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthedRequest extends Request {
  user?: { id: string; role: 'admin' | 'viewer' };
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Немає токена авторизації' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { id: string; role: 'admin' | 'viewer' };
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
