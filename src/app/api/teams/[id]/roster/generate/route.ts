import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRoster, resolveDisplayName, deriveFamilies } from "@/lib/roster-algorithm";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = params.id;

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { enableRoster: true } });
  if (!team?.enableRoster) return NextResponse.json({ error: "Duty roster disabled for this team" }, { status: 403 });

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
        player: { select: { surname: true, firstName: true, parent1: true } },
      },
    }),
    prisma.familyExclusion.findMany({
      where: { teamDutyRole: { teamId } },
    }),
    prisma.familyUnavailability.findMany({
      where: { round: { teamId } },
    }),
  ]);

  // Only regenerate future rounds (past rounds keep their assignments)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const futureRounds = rounds.filter((r) => !r.date || r.date >= today);
  const pastRoundIds = rounds.filter((r) => r.date && r.date < today).map((r) => r.id);

  // Locked future rounds are preserved — their assignments seed the fairness
  // counters so regenerated rounds account for what locked rounds assigned.
  const lockedFutureRoundIds = new Set(futureRounds.filter((r) => r.isRosterLocked).map((r) => r.id));
  const roundsToGenerate = futureRounds.filter((r) => !lockedFutureRoundIds.has(r.id));

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

  const families = deriveFamilies(teamPlayers.map((tp) => tp.player));
  const familyMap = new Map(families.map((f) => [f.id, f]));

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

  // Fetch existing assignments for locked future rounds to seed fairness counters
  const lockedAssignmentRows = lockedFutureRoundIds.size > 0
    ? await prisma.rosterAssignment.findMany({
        where: { roundId: { in: Array.from(lockedFutureRoundIds) }, assignedFamilyId: { not: null } },
        select: { teamDutyRoleId: true, assignedFamilyId: true },
      })
    : [];

  const input = {
    rounds: roundsToGenerate.map((r) => ({
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
    lockedAssignments: lockedAssignmentRows.filter((a): a is { teamDutyRoleId: string; assignedFamilyId: string } => !!a.assignedFamilyId),
  };

  const assignments = generateRoster(input);

  // Prepare display name resolver input
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

  // Delete existing assignments for unlocked future rounds only, then create new ones.
  // Locked future rounds and all past rounds are untouched.
  const unlockedFutureRoundIds = roundsToGenerate.map((r) => r.id);
  await prisma.$transaction([
    prisma.rosterAssignment.deleteMany({
      where: { roundId: { in: unlockedFutureRoundIds }, teamDutyRoleId: { in: teamDutyRoles.map((r) => r.id) } },
    }),
    prisma.rosterAssignment.createMany({
      data: assignments.map((a) => ({
        roundId: a.roundId,
        teamDutyRoleId: a.teamDutyRoleId,
        assignedFamilyId: a.assignedFamilyId,
        assignedFamilyName: resolveDisplayName(displayNameInput, a),
        slot: a.slot,
      })),
    }),
  ]);

  return NextResponse.json({
    count: assignments.length,
    skippedPastRounds: pastRoundIds.length,
    skippedLockedRounds: lockedFutureRoundIds.size,
  });
}
