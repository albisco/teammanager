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
    }),
    // Get families: derive from player surnames
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: {
        player: { select: { surname: true } },
      },
    }),
  ]);

  // Derive families from player surnames
  const familyMap = new Map<string, { id: string; name: string }>();
  for (const tp of families) {
    const surname = tp.player.surname;
    const familyId = `family_${surname.toLowerCase().replace(/\s+/g, "_")}`;
    if (!familyMap.has(familyId)) {
      familyMap.set(familyId, { id: familyId, name: surname });
    }
  }

  // Build assignment map: key = "roundId:teamDutyRoleId"
  const assignmentMap: Record<string, { familyId: string; familyName: string }> = {};
  for (const a of assignments) {
    assignmentMap[`${a.roundId}:${a.teamDutyRoleId}`] = {
      familyId: a.assignedFamilyId,
      familyName: a.assignedFamilyName,
    };
  }

  return NextResponse.json({
    rounds,
    roles: teamDutyRoles.map((r) => ({
      id: r.id,
      roleName: r.dutyRole.roleName,
      roleType: r.roleType,
    })),
    assignments: assignmentMap,
    families: Array.from(familyMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
  });
}
