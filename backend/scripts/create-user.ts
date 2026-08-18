// Створення/оновлення користувача напряму в БД — без публічного API-ендпоінта,
// щоб призначення ролі admin ніколи не залежало від HTTP-шару.
// Використання: npm run user:create -- --email=admin@transpak.ua --password=secret123 --role=admin
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function parseArgs() {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const { email, password, role } = parseArgs();

  if (!email || !password || !role) {
    console.error('Використання: npm run user:create -- --email=... --password=... --role=admin|viewer');
    process.exit(1);
  }
  if (role !== 'admin' && role !== 'viewer') {
    console.error(`Невідома роль "${role}". Дозволено: admin, viewer`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Пароль має містити щонайменше 8 символів');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: role as Role },
    create: { email, passwordHash, role: role as Role },
  });

  console.log(`Готово: ${user.email} → роль "${user.role}" (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error('Помилка створення користувача:', err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
