import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.dutyRole.updateMany({
    where: { roleName: "Coach" },
    data: { roleName: "Head Coach" },
  });
  console.log(`Updated ${result.count} DutyRole row(s): "Coach" → "Head Coach"`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
