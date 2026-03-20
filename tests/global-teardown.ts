import { PrismaClient } from "@prisma/client";

export default async function globalTeardown() {
  const prisma = new PrismaClient();

  await prisma.team.deleteMany({ where: { id: "qa-test-team-id" } });
  await prisma.season.deleteMany({ where: { id: "qa-test-season-id" } });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          "qa_superadmin@teammanager.com",
          "qa_admin@teammanager.com",
          "qa_tm@teammanager.com",
        ],
      },
    },
  });
  await prisma.club.deleteMany({ where: { slug: "qa-test-club" } });

  await prisma.$disconnect();
  console.log("QA test data cleaned up.");
}
