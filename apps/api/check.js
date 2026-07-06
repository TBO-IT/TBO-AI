import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.userRole.findMany().then(console.log).finally(() => prisma.$disconnect());
