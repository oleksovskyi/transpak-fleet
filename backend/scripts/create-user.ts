// Створення/оновлення користувача напряму в БД — без публічного API-ендпоінта,
// щоб призначення ролі admin ніколи не залежало від HTTP-шару.
//
// Онбординг нового клієнта платформи = один виклик із новим --company:
//   npm run user:create -- --email=admin@newclient.ua --password=secret123 --role=admin --company="New Client LLC"
// Кожен наступний користувач того ж клієнта — той самий --company (компанія знаходиться
// за назвою і повторно не створюється):
//   npm run user:create -- --email=viewer@newclient.ua --password=secret123 --role=viewer --company="New Client LLC"
// Або точний --companyId=<uuid>, якщо назва клієнта може повторюватись/бути неоднозначною.
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

async function resolveCompanyId(companyId: string | undefined, companyName: string | undefined) {
  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      console.error(`Компанію з id "${companyId}" не знайдено`);
      process.exit(1);
    }
    return company.id;
  }
  if (companyName) {
    const existing = await prisma.company.findFirst({ where: { name: companyName } });
    if (existing) return existing.id;
    const created = await prisma.company.create({ data: { name: companyName } });
    console.log(`Створено нову компанію "${created.name}" (id: ${created.id})`);
    return created.id;
  }
  console.error('Вкажіть --company="Назва клієнта" (або --companyId=... для вже існуючої компанії)');
  process.exit(1);
}

async function main() {
  const { email, password, role, company, companyId: companyIdArg } = parseArgs();

  if (!email || !password || !role) {
    console.error(
      'Використання: npm run user:create -- --email=... --password=... --role=admin|viewer --company="Назва клієнта"',
    );
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

  const existingUser = await prisma.user.findUnique({ where: { email } });
  // companyId для нового користувача обов'язковий; для вже існуючого — компанію не змінюємо.
  const companyId = existingUser ? existingUser.companyId : await resolveCompanyId(companyIdArg, company);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: role as Role },
    create: { email, passwordHash, role: role as Role, companyId: companyId! },
  });

  console.log(`Готово: ${user.email} → роль "${user.role}", компанія ${user.companyId} (id користувача: ${user.id})`);
}

main()
  .catch((err) => {
    console.error('Помилка створення користувача:', err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
