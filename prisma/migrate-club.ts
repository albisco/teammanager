import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create default club
  const club = await prisma.club.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Default Club",
      slug: "default",
    },
  });

  console.log("Created/found club:", club.id, club.name);

  // Update all existing records
  const u = await prisma.$executeRaw`UPDATE "User" SET "clubId" = ${club.id} WHERE "clubId" = 'placeholder' OR "clubId" = ''`;
  const p = await prisma.$executeRaw`UPDATE "Player" SET "clubId" = ${club.id} WHERE "clubId" = 'placeholder' OR "clubId" = ''`;
  const s = await prisma.$executeRaw`UPDATE "Season" SET "clubId" = ${club.id} WHERE "clubId" = 'placeholder' OR "clubId" = ''`;
  const d = await prisma.$executeRaw`UPDATE "DutyRole" SET "clubId" = ${club.id} WHERE "clubId" = 'placeholder' OR "clubId" = ''`;

  console.log(`Updated: ${u} users, ${p} players, ${s} seasons, ${d} duty roles`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
