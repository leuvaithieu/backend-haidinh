import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(
    process.cwd(),
    'src',
    'prisma',
    'customers_1000.json',
  );

  const file = fs.readFileSync(filePath, 'utf-8');

  const customers = JSON.parse(file);

  const result = await prisma.customer.createMany({
    data: customers,
    skipDuplicates: true,
  });

  console.log(`Đã thêm ${result.count} khách hàng`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });