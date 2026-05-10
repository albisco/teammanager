/**
 * One-shot backfill: for each Club, copy voting/feature fields from the club's
 * first Team row into the new Club columns. Clubs with no teams keep schema defaults.
 *
 * Run once after applying the Club schema additions:
 *   npx tsx scripts/backfill-club-voting-fields.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const clubs = await prisma.club.findMany({ select: { id: true } });

  for (const club of clubs) {
    const firstTeam = await prisma.team.findFirst({
      where: { season: { clubId: club.id } },
      orderBy: { season: { year: "asc" } },
      select: {
        votingScheme: true,
        parentVoterCount: true,
        coachVoterCount: true,
        enableRoster: true,
        enableAwards: true,
      },
    });

    if (!firstTeam) {
      console.log(`Club ${club.id}: no teams found, keeping schema defaults`);
      continue;
    }

    await prisma.club.update({
      where: { id: club.id },
      data: {
        votingScheme: firstTeam.votingScheme as number[],
        parentVoterCount: firstTeam.parentVoterCount,
        coachVoterCount: firstTeam.coachVoterCount,
        enableRoster: firstTeam.enableRoster,
        enableAwards: firstTeam.enableAwards,
      },
    });

    console.log(`Club ${club.id}: backfilled from first team`);
  }

  console.log("Backfill complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
