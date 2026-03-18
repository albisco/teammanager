import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Returns all data needed to render the manager roster page in a single request
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as Record<string, unknown>)?.teamId as string;
  if (!teamId) {
    return NextResponse.json({ error: "No team assigned" }, { status: 400 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const [
    users,
    globalRoles,
    teamDutyRoles,
    rounds,
    assignments,
    teamPlayers,
    unavailabilities,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { clubId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.dutyRole.findMany({
      where: { clubId },
      orderBy: { roleName: "asc" },
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId },
      include: {
        dutyRole: true,
        assignedUser: { select: { id: true, name: true } },
        specialists: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { dutyRole: { roleName: "asc" } },
    }),
    prisma.round.findMany({
      where: { teamId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, isBye: true, date: true, opponent: true },
    }),
    prisma.rosterAssignment.findMany({
      where: { round: { teamId } },
      include: { assignedFamily: { select: { id: true, name: true } } },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: { include: { family: { select: { id: true, name: true } } } } },
    }),
    prisma.familyUnavailability.findMany({
      where: { round: { teamId } },
      select: { familyId: true, roundId: true },
    }),
  ]);

  // Deduplicate families from team players
  const familyMap = new Map<string, { id: string; name: string }>();
  for (const tp of teamPlayers) {
    if (tp.player.family) familyMap.set(tp.player.family.id, tp.player.family);
  }
  const families = Array.from(familyMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Build assignment map and duty counts
  const assignmentMap: Record<string, Array<{ familyId: string; familyName: string; slot: number }>> = {};
  const dutyCounts: Record<string, Record<string, number>> = {};
  for (const a of assignments) {
    const key = `${a.roundId}:${a.teamDutyRoleId}`;
    if (!assignmentMap[key]) assignmentMap[key] = [];
    assignmentMap[key].push({ familyId: a.assignedFamily.id, familyName: a.assignedFamily.name, slot: a.slot });
    const fId = a.assignedFamily.id;
    if (!dutyCounts[fId]) dutyCounts[fId] = {};
    dutyCounts[fId][a.teamDutyRoleId] = (dutyCounts[fId][a.teamDutyRoleId] || 0) + 1;
  }
  for (const key of Object.keys(assignmentMap)) {
    assignmentMap[key].sort((a, b) => a.slot - b.slot);
  }

  // Merge global roles with team config
  const configMap = new Map(teamDutyRoles.map((c) => [c.dutyRoleId, c]));
  const teamRoles = globalRoles.map((role) => {
    const config = configMap.get(role.id);
    return {
      dutyRoleId: role.id,
      roleName: role.roleName,
      teamDutyRoleId: config?.id || null,
      roleType: config?.roleType || "ROTATING",
      assignedUser: config?.assignedUser || null,
      frequencyWeeks: config?.frequencyWeeks || 1,
      slots: config?.slots || 1,
      specialists: config?.specialists || [],
      configured: !!config,
    };
  });

  return NextResponse.json({
    users,
    globalRoles,
    teamRoles,
    roster: {
      rounds,
      roles: teamDutyRoles.map((r) => ({
        id: r.id,
        roleName: r.dutyRole.roleName,
        roleType: r.roleType,
        slots: r.slots,
      })),
      assignments: assignmentMap,
      families,
      dutyCounts,
    },
    unavailabilities,
  });
}
