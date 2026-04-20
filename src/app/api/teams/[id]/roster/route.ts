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

  const [rounds, teamDutyRoles, assignments, families] = await Promise.all([
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
    // Get families: derive from player data
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: {
        player: { select: { surname: true, firstName: true, parent1: true } },
      },
    }),
  ]);

  const familyList = deriveFamilies(families.map((tp) => tp.player));
  const familyMap = new Map(familyList.map((f) => [f.id, f]));

  // Build assignment map: key = "roundId:teamDutyRoleId" -> array of slots
  const assignmentMap: Record<string, Array<{ familyId: string; familyName: string; slot: number }>> = {};
  const dutyCounts: Record<string, Record<string, number>> = {};
  for (const a of assignments) {
    const key = `${a.roundId}:${a.teamDutyRoleId}`;
    if (!assignmentMap[key]) assignmentMap[key] = [];
    assignmentMap[key].push({
      familyId: a.assignedFamilyId,
      familyName: a.assignedFamilyName,
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
