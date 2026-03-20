import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export default async function globalSetup() {
  const prisma = new PrismaClient();

  const passwordHash = await bcrypt.hash("test1234", 10);

  // Use the default club if seeded, otherwise use/create a QA club
  let club = await prisma.club.findFirst({ where: { slug: "default" } });
  if (!club) {
    club = await prisma.club.upsert({
      where: { slug: "qa-test-club" },
      update: {},
      create: { name: "QA Test Club", slug: "qa-test-club" },
    });
  }

  // QA Super Admin (no clubId, as per architecture)
  await prisma.user.upsert({
    where: { email: "qa_superadmin@teammanager.com" },
    update: {},
    create: {
      email: "qa_superadmin@teammanager.com",
      passwordHash,
      name: "QA Super Admin",
      role: "SUPER_ADMIN",
    },
  });

  // QA Admin
  await prisma.user.upsert({
    where: { email: "qa_admin@teammanager.com" },
    update: {},
    create: {
      email: "qa_admin@teammanager.com",
      passwordHash,
      name: "QA Admin",
      role: "ADMIN",
      clubId: club.id,
    },
  });

  // QA Team Manager
  const tm = await prisma.user.upsert({
    where: { email: "qa_tm@teammanager.com" },
    update: {},
    create: {
      email: "qa_tm@teammanager.com",
      passwordHash,
      name: "QA Team Manager",
      role: "TEAM_MANAGER",
      clubId: club.id,
    },
  });

  // QA Season
  const season = await prisma.season.upsert({
    where: { id: "qa-test-season-id" },
    update: {},
    create: {
      id: "qa-test-season-id",
      name: "QA Season 2026",
      year: 2026,
      clubId: club.id,
    },
  });

  // QA Team assigned to TM
  await prisma.team.upsert({
    where: { id: "qa-test-team-id" },
    update: { managerId: tm.id },
    create: {
      id: "qa-test-team-id",
      name: "QA Team",
      ageGroup: "U12",
      seasonId: season.id,
      managerId: tm.id,
    },
  });

  await prisma.$disconnect();
  console.log("QA test users and team created.");
}
