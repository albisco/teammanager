import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as Record<string, unknown>)?.teamId as string;
  if (!teamId) {
    return NextResponse.json({ error: "No team assigned" }, { status: 400 });
  }

  // Find next upcoming round (not a bye, has a date, date >= now)
  const now = new Date();
  const rounds = await prisma.round.findMany({
    where: { teamId, isBye: false, date: { not: null } },
    orderBy: { date: "asc" },
    select: { id: true, roundNumber: true, date: true, gameTime: true, opponent: true, venue: true },
  });

  const nextRound = rounds.find((r) => r.date! >= now) ?? null;
  if (!nextRound) {
    return NextResponse.json({ round: null, duties: [] });
  }

  // Get assignments for this round with role names
  const assignments = await prisma.rosterAssignment.findMany({
    where: { roundId: nextRound.id },
    include: {
      teamDutyRole: {
        include: { dutyRole: true },
      },
    },
    orderBy: { slot: "asc" },
  });

  // Group by role name
  const roleMap = new Map<string, string[]>();
  for (const a of assignments) {
    const roleName = a.teamDutyRole.dutyRole.roleName;
    if (!roleMap.has(roleName)) roleMap.set(roleName, []);
    roleMap.get(roleName)!.push(a.assignedFamilyName);
  }

  const duties = Array.from(roleMap.entries()).map(([roleName, names]) => ({
    roleName,
    names,
  }));

  return NextResponse.json({
    round: {
      id: nextRound.id,
      roundNumber: nextRound.roundNumber,
      date: nextRound.date,
      gameTime: nextRound.gameTime,
      opponent: nextRound.opponent,
      venue: nextRound.venue,
    },
    duties,
  });
}
