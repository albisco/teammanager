import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveFamiliesWithPlayers } from "@/lib/roster-algorithm";

async function resolveContext(userId: string, roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { teamId: true, isRosterLocked: true, isBye: true },
  });
  if (!round) return { error: "Round not found", status: 404 } as const;

  const familyTeamIds = await prisma.teamPlayer
    .findMany({ where: { player: { familyId: userId } }, select: { teamId: true } })
    .then((rows) => rows.map((r) => r.teamId));

  const manualTeamIds = await prisma.familyTeamAccess
    .findMany({ where: { familyUserId: userId }, select: { teamId: true } })
    .then((rows) => rows.map((r) => r.teamId));

  const accessibleTeamIds = new Set([...familyTeamIds, ...manualTeamIds]);
  if (!accessibleTeamIds.has(round.teamId)) return { error: "Forbidden", status: 403 } as const;

  // Derive the family ID for this user in this team
  const allPlayers = await prisma.teamPlayer.findMany({
    where: { teamId: round.teamId },
    select: { player: { select: { id: true, firstName: true, surname: true, parent1: true, familyId: true } } },
  });

  const allPlayerData = allPlayers.map((tp) => tp.player);
  const userPlayerIds = new Set(allPlayerData.filter((p) => p.familyId === userId).map((p) => p.id));
  const families = deriveFamiliesWithPlayers(allPlayerData);
  const userFamilyIds = families
    .filter((f) => f.playerIds.some((pid) => userPlayerIds.has(pid)))
    .map((f) => f.id);

  if (userFamilyIds.length === 0) return { error: "No family identity found for this team", status: 400 } as const;

  return { round, userFamilyIds };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "FAMILY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { roundId } = await req.json();
  if (!roundId) return NextResponse.json({ error: "roundId is required" }, { status: 400 });

  const ctx = await resolveContext(session.user.id, roundId);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  if (ctx.round.isRosterLocked) {
    return NextResponse.json({ error: "Roster is locked for this round" }, { status: 409 });
  }

  // Upsert for the primary family ID (first in list)
  await prisma.familyUnavailability.upsert({
    where: { familyId_roundId: { familyId: ctx.userFamilyIds[0], roundId } },
    create: { familyId: ctx.userFamilyIds[0], roundId },
    update: {},
  });

  return NextResponse.json({ unavailable: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "FAMILY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { roundId } = await req.json();
  if (!roundId) return NextResponse.json({ error: "roundId is required" }, { status: 400 });

  const ctx = await resolveContext(session.user.id, roundId);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  if (ctx.round.isRosterLocked) {
    return NextResponse.json({ error: "Roster is locked for this round" }, { status: 409 });
  }

  await prisma.familyUnavailability.deleteMany({
    where: { familyId: { in: ctx.userFamilyIds }, roundId },
  });

  return NextResponse.json({ unavailable: false });
}
