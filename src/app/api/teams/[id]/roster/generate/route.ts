import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRoster } from "@/lib/roster-algorithm";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = params.id;

  const [rounds, teamDutyRoles, teamPlayers, exclusions, unavailabilities] = await Promise.all([
    prisma.round.findMany({
      where: { teamId },
      orderBy: { roundNumber: "asc" },
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
      include: {
        player: {
          include: { family: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.familyExclusion.findMany({
      where: { teamDutyRole: { teamId } },
    }),
    prisma.familyUnavailability.findMany({
      where: { round: { teamId } },
    }),
  ]);

  // Deduplicate families from team players
  const familyMap = new Map<string, { id: string; name: string }>();
  for (const tp of teamPlayers) {
    if (tp.player.family) {
      familyMap.set(tp.player.family.id, tp.player.family);
    }
  }
  const families = Array.from(familyMap.values());

  if (families.length === 0) {
    return NextResponse.json(
      { error: "No families found. Players must be linked to family users first." },
      { status: 400 }
    );
  }

  const input = {
    rounds: rounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      isBye: r.isBye,
    })),
    families,
    teamDutyRoles: teamDutyRoles.map((tdr) => ({
      id: tdr.id,
      roleName: tdr.dutyRole.roleName,
      roleType: tdr.roleType,
      assignedUserId: tdr.assignedUserId,
      frequencyWeeks: tdr.frequencyWeeks,
      specialistFamilyIds: tdr.specialists.map((s) => s.userId),
    })),
    exclusions: exclusions.map((e) => ({
      familyId: e.familyId,
      teamDutyRoleId: e.teamDutyRoleId,
    })),
    unavailabilities: unavailabilities.map((u) => ({
      familyId: u.familyId,
      roundId: u.roundId,
    })),
  };

  const assignments = generateRoster(input);

  // Delete existing assignments and create new ones in a transaction
  const roundIds = rounds.map((r) => r.id);
  await prisma.$transaction([
    prisma.rosterAssignment.deleteMany({
      where: { roundId: { in: roundIds }, teamDutyRoleId: { in: teamDutyRoles.map((r) => r.id) } },
    }),
    prisma.rosterAssignment.createMany({
      data: assignments.map((a) => ({
        roundId: a.roundId,
        teamDutyRoleId: a.teamDutyRoleId,
        assignedFamilyId: a.assignedFamilyId,
      })),
    }),
  ]);

  return NextResponse.json({ count: assignments.length });
}
