# Transpak Fleet

Платформа управління автопарком Transpak: статуси ТЗ, регламентне ТО з окремими
інтервалами по видах робіт, ремонти, пробіг, водії, маршрути, паливо.
Телеметрія — через інтеграцію з Wialon API.

## Структура
- `backend/` — API + Prisma-схема БД (PostgreSQL)
- `frontend/` — клієнтський застосунок (зараз: робочий HTML-прототип у `public/index.html`)
- `sync-service/` — синхронізація з Wialon (зараз працює на мок-даних)
- `docs/` — технічний план і design-референс

## Швидкий старт (розробка)

```bash
# backend
cd backend
cp .env.example .env   # вкажіть DATABASE_URL і JWT_SECRET
npm install
npm run prisma:migrate
npm run dev

# sync-service (окремий термінал)
cd sync-service
npm install
npm run dev

# frontend — поки що просто відкрийте frontend/public/index.html у браузері
```

## Для Claude Code
Прочитайте `CLAUDE.md` у корені — там опис бізнес-правил, структури і стилю
роботи над проєктом.
