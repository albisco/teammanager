import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveFamilyMembers, deriveFamilies } from "@/lib/roster-algorithm";

// Returns all data needed to render the manager roster page in a single request
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as Record<string, unknown>)?.teamId as string;
  if (!teamId) {
    return NextResponse.json({ error: "No team assigned" }, { status: 400 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const [
    team,
    users,
    globalRoles,
    teamDutyRoles,
    rounds,
    assignments,
    teamPlayers,
    unavailabilities,
    exclusions,
  ] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { availabilityToken: true, name: true, ageGroup: true } }),
    prisma.user.findMany({
      where: { clubId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.dutyRole.findMany({
      where: { clubId, OR: [{ teamId: null }, { teamId }] },
      orderBy: [{ sortOrder: "asc" }, { roleName: "asc" }],
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId },
      include: {
        dutyRole: true,
        specialists: true,
      },
      orderBy: [{ dutyRole: { sortOrder: "asc" } }, { dutyRole: { roleName: "asc" } }],
    }),
    prisma.round.findMany({
      where: { teamId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, isBye: true, date: true, gameTime: true, opponent: true, venue: true, isRosterLocked: true },
    }),
    prisma.rosterAssignment.findMany({
      where: { round: { teamId } },
      select: { id: true, roundId: true, teamDutyRoleId: true, assignedFamilyId: true, assignedFamilyName: true, slot: true },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: { select: { surname: true, firstName: true, parent1: true, parent2: true } } },
    }),
    prisma.familyUnavailability.findMany({
      where: { round: { teamId } },
      select: { familyId: true, roundId: true },
    }),
    prisma.teamDutyRoleExclusion.findMany({
      where: { teamId },
      select: { dutyRoleId: true },
    }),
  ]);

  const excludedIds = new Set(exclusions.map((e) => e.dutyRoleId));
  const visibleGlobalRoles = globalRoles.filter(
    (r) => r.teamId !== null || !excludedIds.has(r.id)
  );

  const families = deriveFamilies(teamPlayers.map((tp) => tp.player)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Derive family members (parents) for specialist/fixed role config
  const familyMembers = deriveFamilyMembers(
    teamPlayers.map((tp) => tp.player)
  );

  // Build assignment map and duty counts
  const assignmentMap: Record<string, Array<{ familyId: string; familyName: string; slot: number }>> = {};
  const dutyCounts: Record<string, Record<string, number>> = {};
  for (const a of assignments) {
    const key = `${a.roundId}:${a.teamDutyRoleId}`;
    if (!assignmentMap[key]) assignmentMap[key] = [];
    assignmentMap[key].push({ familyId: a.assignedFamilyId, familyName: a.assignedFamilyName, slot: a.slot });
    const fId = a.assignedFamilyId;
    if (!dutyCounts[fId]) dutyCounts[fId] = {};
    dutyCounts[fId][a.teamDutyRoleId] = (dutyCounts[fId][a.teamDutyRoleId] || 0) + 1;
  }
  for (const key of Object.keys(assignmentMap)) {
    assignmentMap[key].sort((a, b) => a.slot - b.slot);
  }

  // Merge global roles with team config
  const configMap = new Map(teamDutyRoles.map((c) => [c.dutyRoleId, c]));
  const teamRoles = visibleGlobalRoles.map((role) => {
    const config = configMap.get(role.id);
    return {
      dutyRoleId: role.id,
      roleName: role.roleName,
      isTeamScoped: role.teamId !== null,
      teamDutyRoleId: config?.id || null,
      roleType: config?.roleType || "ROTATING",
      assignedPersonName: config?.assignedPersonName || null,
      assignedFamilyId: config?.assignedFamilyId || null,
      frequencyWeeks: config?.frequencyWeeks || 1,
      slots: config?.slots || 1,
      specialists: (config?.specialists || []).map((s) => ({
        id: s.id,
        personName: s.personName,
        familyId: s.familyId,
      })),
      configured: !!config,
    };
  });

  return NextResponse.json({
    availabilityToken: team?.availabilityToken ?? null,
    teamName: team ? `${team.ageGroup} ${team.name}`.trim() : "",
    users,
    globalRoles: visibleGlobalRoles,
    teamRoles,
    familyMembers,
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
