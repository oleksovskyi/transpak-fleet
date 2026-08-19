# Білд-контекст — корінь репозиторію (Railway RAILWAY_DOCKERFILE_PATH=backend/Dockerfile)
FROM node:20-slim
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN npx prisma generate
RUN npm run build

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
