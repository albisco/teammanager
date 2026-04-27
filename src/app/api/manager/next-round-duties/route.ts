import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveFamilies, resolveDisplayName } from "@/lib/roster-algorithm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.TEAM_MANAGER) {
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

  // Fetch everything needed to resolve display names correctly
  const [assignments, teamDutyRoles, teamPlayers] = await Promise.all([
    prisma.rosterAssignment.findMany({
      where: { roundId: nextRound.id },
      include: {
        teamDutyRole: {
          include: {
            dutyRole: true,
            specialists: true,
          },
        },
      },
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId },
      include: {
        dutyRole: true,
        specialists: true,
      },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: { select: { surname: true, firstName: true, parent1: true } } },
    }),
  ]);

  const families = deriveFamilies(teamPlayers.map((tp) => tp.player));
  const familyMap = new Map(families.map((f) => [f.id, f]));

  const displayNameInput = {
    teamDutyRoles: teamDutyRoles.map((tdr) => ({
      id: tdr.id,
      roleType: tdr.roleType as "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY",
      assignedFamilyId: tdr.assignedFamilyId,
      assignedPersonName: tdr.assignedPersonName,
      specialists: tdr.specialists.map((s) => ({ personName: s.personName, familyId: s.familyId })),
    })),
    familyMap,
  };

  // Group by role, preserving dutyRole sort order
  const roleMap = new Map<string, { sortOrder: number; roleName: string; names: string[] }>();
  for (const a of assignments) {
    const tdr = a.teamDutyRole;
    const roleId = tdr.id;
    if (!roleMap.has(roleId)) {
      roleMap.set(roleId, {
        sortOrder: tdr.dutyRole.sortOrder,
        roleName: tdr.dutyRole.roleName,
        names: [],
      });
    }
    const displayName = resolveDisplayName(displayNameInput, {
      teamDutyRoleId: a.teamDutyRoleId,
      assignedFamilyId: a.assignedFamilyId ?? "",
    });
    roleMap.get(roleId)!.names.push(displayName);
  }

  const duties = Array.from(roleMap.values())
    .sort((a, b) => a.sortOrder - b.sortOrder || a.roleName.localeCompare(b.roleName))
    .map(({ roleName, names }) => ({ roleName, names }));

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
