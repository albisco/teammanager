import { PrismaClient } from "@prisma/client";

export default async function globalTeardown() {
  const prisma = new PrismaClient();

  // Clean up QA test data
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

  // Clean up e2e test data (clubs with e2e_ prefix cascade-delete all related data)
  const e2eClubs = await prisma.club.findMany({
    where: { name: { startsWith: "e2e_" } },
    select: { id: true },
  });
  if (e2eClubs.length > 0) {
    const clubIds = e2eClubs.map((c) => c.id);
    // Delete in dependency order
    await prisma.rosterAssignment.deleteMany({ where: { round: { team: { season: { clubId: { in: clubIds } } } } } });
    await prisma.familyUnavailability.deleteMany({ where: { round: { team: { season: { clubId: { in: clubIds } } } } } });
    await prisma.familyExclusion.deleteMany({ where: { teamDutyRole: { team: { season: { clubId: { in: clubIds } } } } } });
    await prisma.teamDutyRoleSpecialist.deleteMany({ where: { teamDutyRole: { team: { season: { clubId: { in: clubIds } } } } } });
    await prisma.teamDutyRole.deleteMany({ where: { team: { season: { clubId: { in: clubIds } } } } });
    await prisma.vote.deleteMany({ where: { votingSession: { round: { team: { season: { clubId: { in: clubIds } } } } } } });
    await prisma.votingSession.deleteMany({ where: { round: { team: { season: { clubId: { in: clubIds } } } } } });
    await prisma.round.deleteMany({ where: { team: { season: { clubId: { in: clubIds } } } } });
    await prisma.teamPlayer.deleteMany({ where: { team: { season: { clubId: { in: clubIds } } } } });
    await prisma.team.deleteMany({ where: { season: { clubId: { in: clubIds } } } });
    await prisma.season.deleteMany({ where: { clubId: { in: clubIds } } });
    await prisma.dutyRole.deleteMany({ where: { clubId: { in: clubIds } } });
    await prisma.player.deleteMany({ where: { clubId: { in: clubIds } } });
    await prisma.user.deleteMany({ where: { clubId: { in: clubIds } } });
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } });
    console.log(`Cleaned up ${e2eClubs.length} e2e test club(s).`);
  }

  await prisma.$disconnect();
  console.log("QA test data cleaned up.");
}
