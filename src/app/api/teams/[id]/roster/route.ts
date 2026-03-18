import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = params.id;

  const [rounds, teamDutyRoles, assignments, families] = await Promise.all([
    prisma.round.findMany({
      where: { teamId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, isBye: true, date: true, opponent: true },
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId },
      include: { dutyRole: true },
      orderBy: { dutyRole: { roleName: "asc" } },
    }),
    prisma.rosterAssignment.findMany({
      where: { round: { teamId } },
      include: {
        assignedFamily: { select: { id: true, name: true } },
      },
    }),
    // Get families: distinct users linked to players on this team
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: {
        player: {
          include: {
            family: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  // Deduplicate families
  const familyMap = new Map<string, { id: string; name: string }>();
  for (const tp of families) {
    if (tp.player.family) {
      familyMap.set(tp.player.family.id, tp.player.family);
    }
  }

  // Build assignment map: key = "roundId:teamDutyRoleId" -> sorted array of slots
  const assignmentMap: Record<string, Array<{ familyId: string; familyName: string; slot: number }>> = {};
  // duty counts: familyId -> roleId -> count
  const dutyCounts: Record<string, Record<string, number>> = {};

  for (const a of assignments) {
    const key = `${a.roundId}:${a.teamDutyRoleId}`;
    if (!assignmentMap[key]) assignmentMap[key] = [];
    assignmentMap[key].push({ familyId: a.assignedFamily.id, familyName: a.assignedFamily.name, slot: a.slot });
    const fId = a.assignedFamily.id;
    if (!dutyCounts[fId]) dutyCounts[fId] = {};
    dutyCounts[fId][a.teamDutyRoleId] = (dutyCounts[fId][a.teamDutyRoleId] || 0) + 1;
  }
  // Sort each cell's slots in order
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
