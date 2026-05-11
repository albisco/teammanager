import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const NO_OPT_OUT_NAMES = [
  "Coach",
  "Assistant Coach",
  "Assistant coach",
  "Team Manager",
  "Team manager",
  "Oranges and lollies",
  "Team Photos",
  "Umpire escort",
];

async function main() {
  const dutyRoles = await prisma.dutyRole.findMany({
    where: { roleName: { in: NO_OPT_OUT_NAMES } },
    select: { id: true, roleName: true },
  });

  if (dutyRoles.length === 0) {
    console.log("No matching duty roles found");
    return;
  }

  console.log("Found duty roles:", dutyRoles.map((r) => r.roleName).join(", "));

  const result = await prisma.teamDutyRole.updateMany({
    where: { dutyRoleId: { in: dutyRoles.map((r) => r.id) } },
    data: { allowOptOut: false },
  });

  console.log(`Updated ${result.count} TeamDutyRole row(s) → allowOptOut = false`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
