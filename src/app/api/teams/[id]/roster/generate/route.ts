import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRoster } from "@/lib/roster-algorithm";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
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
        player: { select: { surname: true } },
      },
    }),
    prisma.familyExclusion.findMany({
      where: { teamDutyRole: { teamId } },
    }),
    prisma.familyUnavailability.findMany({
      where: { round: { teamId } },
    }),
  ]);

  // Validate prerequisites
  const activeRounds = rounds.filter((r) => !r.isBye);
  if (activeRounds.length === 0) {
    return NextResponse.json(
      { error: "No rounds found for this team. Add rounds before generating a roster." },
      { status: 400 }
    );
  }

  if (teamDutyRoles.length === 0) {
    return NextResponse.json(
      { error: "No duty roles have been configured for this team. Configure at least one role before generating." },
      { status: 400 }
    );
  }

  // Derive families from player surnames (grouped by surname)
  const familyMap = new Map<string, { id: string; name: string }>();
  for (const tp of teamPlayers) {
    const surname = tp.player.surname;
    const familyId = `family_${surname.toLowerCase().replace(/\s+/g, "_")}`;
    if (!familyMap.has(familyId)) {
      familyMap.set(familyId, { id: familyId, name: surname });
    }
  }
  const families = Array.from(familyMap.values());

  if (families.length === 0) {
    return NextResponse.json(
      { error: "No players found on this team." },
      { status: 400 }
    );
  }

  // Add external specialists/fixed people to the families list so the algorithm can assign them
  for (const tdr of teamDutyRoles) {
    if (tdr.roleType === "FIXED" && tdr.assignedFamilyId && !familyMap.has(tdr.assignedFamilyId)) {
      const extId = tdr.assignedFamilyId;
      familyMap.set(extId, { id: extId, name: tdr.assignedPersonName || extId });
      families.push(familyMap.get(extId)!);
    }
    for (const s of tdr.specialists) {
      if (s.familyId && !familyMap.has(s.familyId)) {
        familyMap.set(s.familyId, { id: s.familyId, name: s.personName });
        families.push(familyMap.get(s.familyId)!);
      }
      if (!s.familyId) {
        // External person without a family link — give them a synthetic ID
        const extId = `external_${s.personName.toLowerCase().replace(/\s+/g, "_")}`;
        if (!familyMap.has(extId)) {
          familyMap.set(extId, { id: extId, name: s.personName });
          families.push(familyMap.get(extId)!);
        }
      }
    }
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
      assignedFamilyId: tdr.assignedFamilyId,
      frequencyWeeks: tdr.frequencyWeeks,
      slots: tdr.slots,
      specialistFamilyIds: tdr.specialists.map((s) =>
        s.familyId || `external_${s.personName.toLowerCase().replace(/\s+/g, "_")}`
      ),
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
        assignedFamilyName: familyMap.get(a.assignedFamilyId)?.name || a.assignedFamilyId,
        slot: a.slot,
      })),
    }),
  ]);

  return NextResponse.json({ count: assignments.length });
}
