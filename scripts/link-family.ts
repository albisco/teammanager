/**
 * One-time script: link Lawson McGregor (U10s) and Quinn McGregor (U8s)
 * to the family user mp@gmail.com (Max Power).
 *
 * Run with: npx tsx scripts/link-family.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const familyUser = await prisma.user.findUnique({
    where: { email: "mp@gmail.com" },
    select: { id: true, name: true, clubId: true },
  });

  if (!familyUser) {
    console.error("User mp@gmail.com not found");
    process.exit(1);
  }

  console.log(`Found family user: ${familyUser.name} (${familyUser.id})`);

  const players = await prisma.player.findMany({
    where: {
      clubId: familyUser.clubId!,
      surname: "McGregor",
      firstName: { in: ["Lawson", "Quinn"] },
    },
    include: { teamPlayers: { include: { team: { select: { name: true, ageGroup: true } } } } },
  });

  if (players.length === 0) {
    console.error("No McGregor players found in this club");
    process.exit(1);
  }

  for (const player of players) {
    const teams = player.teamPlayers.map((tp) => `${tp.team.ageGroup} ${tp.team.name}`).join(", ");
    console.log(`Linking ${player.firstName} ${player.surname} (${teams || "no team"}) → ${familyUser.name}`);

    await prisma.player.update({
      where: { id: player.id },
      data: { familyId: familyUser.id },
    });
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
