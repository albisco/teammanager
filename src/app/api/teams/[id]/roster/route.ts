import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveFamilies } from "@/lib/roster-algorithm";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = params.id;

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { enableRoster: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (!team.enableRoster) return NextResponse.json({ error: "Duty roster disabled for this team" }, { status: 403 });

  const teamRow = await prisma.team.findUnique({
    where: { id: teamId },
    select: { season: { select: { clubId: true } } },
  });
  const clubId = teamRow?.season?.clubId;

  const [rounds, teamDutyRolesRaw, assignments, families, clubRoles, exclusions] = await Promise.all([
    prisma.round.findMany({
      where: { teamId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, isBye: true, date: true, gameTime: true, isRosterLocked: true },
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId },
      include: { dutyRole: true },
      orderBy: [{ dutyRole: { sortOrder: "asc" } }, { dutyRole: { roleName: "asc" } }],
    }),
    prisma.rosterAssignment.findMany({
      where: { round: { teamId } },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: {
        player: { select: { surname: true, firstName: true, parent1: true } },
      },
    }),
    clubId
      ? prisma.dutyRole.findMany({
          where: { clubId, OR: [{ teamId: null }, { teamId }] },
          orderBy: [{ sortOrder: "asc" }, { roleName: "asc" }],
        })
      : Promise.resolve([]),
    prisma.teamDutyRoleExclusion.findMany({
      where: { teamId },
      select: { dutyRoleId: true },
    }),
  ]);

  // Lazy-create TeamDutyRole rows for any visible global role missing one so
  // newly added club roles show up in the grid without needing a Configure or
  // page refresh.
  const excludedIds = new Set(exclusions.map((e) => e.dutyRoleId));
  const visibleClubRoles = clubRoles.filter(
    (r) => r.teamId !== null || !excludedIds.has(r.id)
  );
  const existingDutyRoleIds = new Set(teamDutyRolesRaw.map((r) => r.dutyRoleId));
  const missing = visibleClubRoles.filter((r) => !existingDutyRoleIds.has(r.id));
  if (missing.length > 0) {
    await Promise.all(
      missing.map((role) =>
        prisma.teamDutyRole
          .create({ data: { teamId, dutyRoleId: role.id, roleType: "ROTATING", slots: 1 } })
          .catch(() => undefined)
      )
    );
  }
  const teamDutyRoles = missing.length > 0
    ? await prisma.teamDutyRole.findMany({
        where: { teamId },
        include: { dutyRole: true },
        orderBy: [{ dutyRole: { sortOrder: "asc" } }, { dutyRole: { roleName: "asc" } }],
      })
    : teamDutyRolesRaw;

  const familyList = deriveFamilies(families.map((tp) => tp.player));
  const familyMap = new Map(familyList.map((f) => [f.id, f]));

  // Build assignment map: key = "roundId:teamDutyRoleId" -> array of slots
  const assignmentMap: Record<string, Array<{ familyId: string; familyName: string; slot: number }>> = {};
  const dutyCounts: Record<string, Record<string, number>> = {};
  for (const a of assignments) {
    // Skip person assignments (they have null familyId)
    if (!a.assignedFamilyId) continue;
    const key = `${a.roundId}:${a.teamDutyRoleId}`;
    if (!assignmentMap[key]) assignmentMap[key] = [];
    assignmentMap[key].push({
      familyId: a.assignedFamilyId,
      familyName: a.assignedFamilyName ?? a.assignedFamilyId,
      slot: a.slot,
    });
    if (!dutyCounts[a.assignedFamilyId]) dutyCounts[a.assignedFamilyId] = {};
    dutyCounts[a.assignedFamilyId][a.teamDutyRoleId] = (dutyCounts[a.assignedFamilyId][a.teamDutyRoleId] || 0) + 1;
  }
  for (const key of Object.keys(assignmentMap)) {
    assignmentMap[key].sort((a, b) => a.slot - b.slot);
  }

  return NextResponse.json({
    rounds,
    roles: teamDutyRoles.map((r) => ({
      id: r.id,
      roleName: r.dutyRole.roleName,
      roleType: r.roleType,
      slots: r.slots,
    })),
    assignments: assignmentMap,
    families: Array.from(familyMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    dutyCounts,
  });
}
