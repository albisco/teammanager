import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isLocalDatabase(url: string) {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL!;
  if (isLocalDatabase(url)) {
    return new PrismaClient();
  }
  const adapter = new PrismaNeon({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
