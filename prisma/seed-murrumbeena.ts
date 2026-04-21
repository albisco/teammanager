import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Murrumbeena Junior Football Club...\n");

  // --- Club ---
  const club = await prisma.club.upsert({
    where: { slug: "murrumbeena-jfc" },
    update: { name: "Murrumbeena Junior Football Club" },
    create: {
      name: "Murrumbeena Junior Football Club",
      slug: "murrumbeena-jfc",
    },
  });
  console.log(`Club: ${club.name} (${club.slug})`);

  // --- Admin user ---
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@murrumbeena.com" },
    update: {},
    create: {
      email: "admin@murrumbeena.com",
      passwordHash,
      name: "Murrumbeena Admin",
      role: "ADMIN",
      clubId: club.id,
    },
  });
  console.log(`Admin: ${admin.email} (password: admin123)`);

  // --- Season ---
  const existingSeason = await prisma.season.findFirst({
    where: { clubId: club.id, year: 2026 },
  });
  const season = existingSeason
    ? await prisma.season.update({ where: { id: existingSeason.id }, data: { name: "SMJFL 2026" } })
    : await prisma.season.create({
        data: { name: "SMJFL 2026", year: 2026, clubId: club.id },
      });
  console.log(`Season: ${season.name}`);

  // --- Teams ---
  const teamDefs = [
    { name: "Lions", ageGroup: "U8", maxRound: 13 },
    { name: "Griffins", ageGroup: "U8", maxRound: 13 },
    { name: "Lions", ageGroup: "U9", maxRound: 13 },
    { name: "Griffins", ageGroup: "U9", maxRound: 13 },
    { name: "Lions", ageGroup: "U10", maxRound: 14 },
    { name: "Griffins", ageGroup: "U10", maxRound: 14 },
  ];

  // Round dates for 2026 SMJFL season (Sundays)
  // Includes bye weeks as isBye rounds
  const roundSchedule: { date: string; isBye: boolean }[] = [
    { date: "2026-04-19", isBye: false }, // R1
    { date: "2026-04-26", isBye: false }, // R2
    { date: "2026-05-03", isBye: false }, // R3
    { date: "2026-05-10", isBye: false }, // R4
    { date: "2026-05-17", isBye: false }, // R5
    { date: "2026-05-24", isBye: false }, // R6
    { date: "2026-05-31", isBye: false }, // R7
    { date: "2026-06-07", isBye: true },  // BYE
    { date: "2026-06-14", isBye: false }, // R8
    { date: "2026-06-21", isBye: false }, // R9
    { date: "2026-06-28", isBye: false }, // R10
    { date: "2026-07-05", isBye: true },  // BYE
    { date: "2026-07-12", isBye: true },  // BYE
    { date: "2026-07-19", isBye: false }, // R11
    { date: "2026-07-26", isBye: false }, // R12
    { date: "2026-08-02", isBye: false }, // R13
    { date: "2026-08-09", isBye: false }, // R14 (U10 only)
  ];

  for (const teamDef of teamDefs) {
    // Upsert team
    const existingTeam = await prisma.team.findFirst({
      where: { seasonId: season.id, name: teamDef.name, ageGroup: teamDef.ageGroup },
    });
    const team = existingTeam
      ? await prisma.team.update({ where: { id: existingTeam.id }, data: {} })
      : await prisma.team.create({
          data: {
            name: teamDef.name,
            ageGroup: teamDef.ageGroup,
            seasonId: season.id,
          },
        });

    // Determine how many rounds this team gets
    // U8/U9: 13 playing rounds + 3 byes = 16 round entries
    // U10: 14 playing rounds + 3 byes = 17 round entries
    const totalEntries = teamDef.maxRound === 13 ? 16 : 17;
    const teamRounds = roundSchedule.slice(0, totalEntries);

    let roundNumber = 1;
    for (const entry of teamRounds) {
      const roundDate = new Date(entry.date + "T10:00:00+10:00"); // 10am AEST
      await prisma.round.upsert({
        where: { teamId_roundNumber: { teamId: team.id, roundNumber } },
        update: { date: roundDate, isBye: entry.isBye },
        create: {
          teamId: team.id,
          roundNumber,
          date: roundDate,
          isBye: entry.isBye,
        },
      });
      roundNumber++;
    }

    console.log(`Team: ${teamDef.ageGroup} ${teamDef.name} — ${teamRounds.length} rounds (${teamRounds.filter((r) => r.isBye).length} byes)`);
  }

  // --- Club-level Duty Roles ---
  const dutyRoleNames = [
    "Canteen",
    "Ground Manager",
    "First Aid",
    "Goal Umpire",
    "Time Keeper",
    "Oranges",
    "Team Photos",
  ];

  for (const roleName of dutyRoleNames) {
    const existing = await prisma.dutyRole.findFirst({
      where: { clubId: club.id, teamId: null, roleName },
      select: { id: true },
    });
    if (!existing) {
      await prisma.dutyRole.create({ data: { roleName, clubId: club.id } });
    }
  }
  console.log(`Duty roles: ${dutyRoleNames.join(", ")}`);

  console.log("\nDone! Login with admin@murrumbeena.com / admin123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
