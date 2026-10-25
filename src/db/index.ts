import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;

export function getDbClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export { PrismaClient };
export * from '@prisma/client';
