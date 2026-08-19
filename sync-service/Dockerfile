# Білд-контекст — корінь репозиторію (Railway RAILWAY_DOCKERFILE_PATH=sync-service/Dockerfile).
# Prisma-клієнт генерується від спільної схеми backend/prisma/schema.prisma в backend/node_modules —
# та сама структура сусідніх директорій, що й локально (див. sync-service/src/prisma.ts).
FROM node:20-slim
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
COPY backend/prisma ./backend/prisma
RUN cd backend && npm ci && npx prisma generate

COPY sync-service/package.json sync-service/package-lock.json ./sync-service/
RUN cd sync-service && npm ci

COPY sync-service/ ./sync-service/
RUN cd sync-service && npm run build

WORKDIR /app/sync-service
CMD ["node", "dist/index.js"]
