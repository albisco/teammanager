import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveFamiliesWithPlayers } from "@/lib/roster-algorithm";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "FAMILY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const teamIds = ((session.user as unknown as { familyTeams?: string[] })?.familyTeams ?? []) as string[];
  if (teamIds.length === 0) return NextResponse.json({ error: "No teams" }, { status: 404 });

  const requestedTeamId = req.nextUrl.searchParams.get("teamId");
  const teamId = requestedTeamId && teamIds.includes(requestedTeamId)
    ? requestedTeamId
    : teamIds[0];

  const [team, allTeams, teamPlayers, teamDutyRoles, rounds, allAssignments, unavailabilities] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, ageGroup: true },
    }),
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true, ageGroup: true },
      orderBy: [{ ageGroup: "asc" }, { name: "asc" }],
    }),
    prisma.teamPlayer.findMany({
      where: { teamId },
      select: { player: { select: { id: true, firstName: true, surname: true, parent1: true, familyId: true } } },
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId },
      select: { id: true, roleType: true, dutyRole: { select: { roleName: true, sortOrder: true } } },
      orderBy: [{ dutyRole: { sortOrder: "asc" } }, { dutyRole: { roleName: "asc" } }],
    }),
    prisma.round.findMany({
      where: { teamId, isBye: false },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, date: true, gameTime: true, opponent: true, isRosterLocked: true },
    }),
    prisma.rosterAssignment.findMany({
      where: { round: { teamId } },
      select: { roundId: true, teamDutyRoleId: true, assignedFamilyId: true, assignedFamilyName: true, slot: true },
    }),
    prisma.familyUnavailability.findMany({
      where: { round: { teamId } },
      select: { roundId: true, familyId: true },
    }),
  ]);

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // Derive this user's family ID for this team
  const allPlayers = teamPlayers.map((tp) => tp.player);
  const userPlayerIds = new Set(allPlayers.filter((p) => p.familyId === userId).map((p) => p.id));
  const families = deriveFamiliesWithPlayers(allPlayers);
  const userFamily = families.find((f) => f.playerIds.some((pid) => userPlayerIds.has(pid)));
  const myFamilyId = userFamily?.id ?? null;

  // Build assignment map: roundId:teamDutyRoleId → array of assignments
  const assignmentMap: Record<string, Array<{ familyId: string; familyName: string; slot: number }>> = {};
  for (const a of allAssignments) {
    const key = `${a.roundId}:${a.teamDutyRoleId}`;
    if (!assignmentMap[key]) assignmentMap[key] = [];
    assignmentMap[key].push({
      familyId: a.assignedFamilyId ?? "",
      familyName: a.assignedFamilyName ?? "",
      slot: a.slot,
    });
  }

  const unavailableSet = new Set(
    unavailabilities
      .filter((u) => u.familyId === myFamilyId)
      .map((u) => u.roundId)
  );

  return NextResponse.json({
    teamId,
    teamName: team.name,
    ageGroup: team.ageGroup,
    allTeams: allTeams.map((t) => ({ id: t.id, name: t.name, ageGroup: t.ageGroup })),
    myFamilyId,
    rounds: rounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      date: r.date,
      gameTime: r.gameTime,
      opponent: r.opponent,
      isRosterLocked: r.isRosterLocked,
      familyUnavailable: unavailableSet.has(r.id),
    })),
    roles: teamDutyRoles
      .filter((r) => r.roleType !== "FIXED")
      .map((r) => ({
        id: r.id,
        roleName: r.dutyRole.roleName,
        roleType: r.roleType,
      })),
    assignments: assignmentMap,
  });
}
