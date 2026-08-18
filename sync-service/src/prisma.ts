// Prisma-клієнт генерується від спільної схеми backend/prisma/schema.prisma
// (npm run prisma:generate) і опиняється в backend/node_modules — sync-service
// власного не тримає, щоб не дублювати схему.
export { PrismaClient } from '../../backend/node_modules/@prisma/client';
