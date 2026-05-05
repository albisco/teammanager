import { PrismaClient, TeamStaffRole, VotingStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding QA data for Murrumbeena (U10 Lions + U9 Griffins)...\n");

  const club = await prisma.club.upsert({
    where: { slug: "murrumbeena-jfc" },
    update: { name: "Murrumbeena Junior Football Club" },
    create: { name: "Murrumbeena Junior Football Club", slug: "murrumbeena-jfc" },
  });
  console.log(`Club: ${club.name}`);

  const adultClub = await prisma.club.upsert({
    where: { slug: "southside-seniors" },
    update: { name: "Southside Seniors FC", isAdultClub: true },
    create: { name: "Southside Seniors FC", slug: "southside-seniors", isAdultClub: true },
  });
  console.log(`Adult Club: ${adultClub.name}`);

  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@murrumbeena.com" },
    update: { clubId: club.id },
    create: {
      email: "admin@murrumbeena.com",
      passwordHash,
      name: "Murrumbeena Admin",
      role: "ADMIN",
      clubId: club.id,
    },
  });
  console.log(`Admin: ${admin.email}`);

  const manager = await prisma.user.upsert({
    where: { email: "lyndenmcgregor@gmail.com" },
    update: { clubId: club.id, role: "TEAM_MANAGER" },
    create: {
      email: "lyndenmcgregor@gmail.com",
      passwordHash,
      name: "Lynden McGregor",
      role: "TEAM_MANAGER",
      clubId: club.id,
    },
  });
  console.log(`Manager: ${manager.email}`);

  const adultAdmin = await prisma.user.upsert({
    where: { email: "admin@southside-seniors.com" },
    update: { clubId: adultClub.id },
    create: {
      email: "admin@southside-seniors.com",
      passwordHash,
      name: "Southside Admin",
      role: "ADMIN",
      clubId: adultClub.id,
    },
  });
  console.log(`Adult Admin: ${adultAdmin.email}`);

  const existingSeason = await prisma.season.findFirst({
    where: { clubId: club.id, year: 2026 },
  });
  const season = existingSeason
    ? await prisma.season.update({ where: { id: existingSeason.id }, data: { name: "SMJFL 2026" } })
    : await prisma.season.create({ data: { name: "SMJFL 2026", year: 2026, clubId: club.id } });
  console.log(`Season: ${season.name}`);

  // Wipe existing teams under this season (cascades rounds, voting, team-players, staff)
  const existing = await prisma.team.findMany({ where: { seasonId: season.id }, select: { id: true } });
  if (existing.length) {
    await prisma.team.deleteMany({ where: { id: { in: existing.map((t) => t.id) } } });
    console.log(`Wiped ${existing.length} existing teams`);
  }

  const roundSchedule = [
    { date: "2026-04-19", isBye: false },
    { date: "2026-04-26", isBye: false },
    { date: "2026-05-03", isBye: false },
    { date: "2026-05-10", isBye: false },
    { date: "2026-05-17", isBye: false },
    { date: "2026-05-24", isBye: false },
    { date: "2026-05-31", isBye: false },
    { date: "2026-06-07", isBye: true },
    { date: "2026-06-14", isBye: false },
    { date: "2026-06-21", isBye: false },
    { date: "2026-06-28", isBye: false },
    { date: "2026-07-05", isBye: true },
    { date: "2026-07-12", isBye: true },
    { date: "2026-07-19", isBye: false },
    { date: "2026-07-26", isBye: false },
    { date: "2026-08-02", isBye: false },
    { date: "2026-08-09", isBye: false },
  ];

  const teamDefs = [
    { name: "Lions", ageGroup: "U10", maxRound: 14, manager: true },
    { name: "Griffins", ageGroup: "U9", maxRound: 13, manager: false },
  ];

  const playerNames = [
    ["Oliver", "Smith"], ["Jack", "Brown"], ["Noah", "Wilson"],
    ["William", "Taylor"], ["Lucas", "Anderson"], ["Henry", "Thomas"],
    ["Leo", "Jackson"], ["Mason", "White"], ["Ethan", "Harris"],
    ["Logan", "Martin"],
  ];

  for (const teamDef of teamDefs) {
    const team = await prisma.team.create({
      data: { name: teamDef.name, ageGroup: teamDef.ageGroup, seasonId: season.id },
    });

    const totalEntries = teamDef.maxRound === 13 ? 16 : 17;
    const teamRounds = roundSchedule.slice(0, totalEntries);

    let roundNumber = 1;
    const createdRounds: { id: string; roundNumber: number; isBye: boolean }[] = [];
    for (const entry of teamRounds) {
      const round = await prisma.round.create({
        data: {
          teamId: team.id,
          roundNumber,
          date: new Date(entry.date + "T10:00:00+10:00"),
          isBye: entry.isBye,
        },
      });
      createdRounds.push({ id: round.id, roundNumber, isBye: entry.isBye });
      roundNumber++;
    }

    // Players + TeamPlayer links
    for (let i = 0; i < playerNames.length; i++) {
      const [firstName, surname] = playerNames[i];
      const player = await prisma.player.create({
        data: {
          firstName,
          surname,
          jumperNumber: i + 1,
          clubId: club.id,
        },
      });
      await prisma.teamPlayer.create({ data: { teamId: team.id, playerId: player.id } });
    }

    // TEAM_MANAGER staff link on Lions only
    if (teamDef.manager) {
      await prisma.teamStaff.create({
        data: { teamId: team.id, userId: manager.id, role: TeamStaffRole.TEAM_MANAGER },
      });

      // Open voting session on first non-bye round
      const r1 = createdRounds.find((r) => !r.isBye);
      if (r1) {
        await prisma.votingSession.create({
          data: { roundId: r1.id, status: VotingStatus.OPEN },
        });
      }
    }

    const refetched = await prisma.team.findUnique({
      where: { id: team.id },
      select: { playerAvailabilityToken: true },
    });
    console.log(
      `Team: ${teamDef.ageGroup} ${teamDef.name} — ${teamRounds.length} rounds, ${playerNames.length} players, availability token: ${refetched?.playerAvailabilityToken}`
    );
  }

  // Voting token printout
  const lionsTeam = await prisma.team.findFirst({
    where: { seasonId: season.id, name: "Lions", ageGroup: "U10" },
    select: { id: true },
  });
  if (lionsTeam) {
    const session = await prisma.votingSession.findFirst({
      where: { round: { teamId: lionsTeam.id } },
      select: { qrToken: true, round: { select: { roundNumber: true } } },
    });
    console.log(`Voting token (U10 Lions R${session?.round.roundNumber}): ${session?.qrToken}`);
  }

  // Club-level duty roles (idempotent)
  const dutyRoleNames = ["Canteen", "Ground Manager", "First Aid", "Goal Umpire", "Time Keeper", "Oranges", "Team Photos"];
  for (const roleName of dutyRoleNames) {
    const existing = await prisma.dutyRole.findFirst({
      where: { clubId: club.id, teamId: null, roleName },
      select: { id: true },
    });
    if (!existing) {
      await prisma.dutyRole.create({ data: { roleName, clubId: club.id } });
    }
  }
  console.log(`Duty roles ensured: ${dutyRoleNames.length}`);

  console.log("\nDone.");
  console.log("  ADMIN:   admin@murrumbeena.com / admin123");
  console.log("  MANAGER: lyndenmcgregor@gmail.com / admin123 (U10 Lions)");
  console.log("  ADULT ADMIN: admin@southside-seniors.com / admin123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
