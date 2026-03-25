interface RosterInput {
  rounds: { id: string; roundNumber: number; isBye: boolean }[];
  families: { id: string; name: string }[];
  teamDutyRoles: {
    id: string;
    roleName: string;
    roleType: "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY";
    assignedUserId?: string | null;
    frequencyWeeks: number;
    slots?: number;
    specialistFamilyIds: string[];
  }[];
  exclusions: { familyId: string; teamDutyRoleId: string }[];
  unavailabilities: { familyId: string; roundId: string }[];
}

interface RosterOutput {
  roundId: string;
  teamDutyRoleId: string;
  assignedFamilyId: string;
  slot: number;
}

export function generateRoster(input: RosterInput): RosterOutput[] {
  const { rounds, families, teamDutyRoles, exclusions, unavailabilities } = input;

  const exclusionSet = new Set(
    exclusions.map((e) => `${e.familyId}:${e.teamDutyRoleId}`)
  );
  const unavailabilitySet = new Set(
    unavailabilities.map((u) => `${u.familyId}:${u.roundId}`)
  );

  // Track assignment counts for fair distribution
  const totalAssignments: Record<string, number> = {};
  const roleAssignments: Record<string, Record<string, number>> = {};
  for (const family of families) {
    totalAssignments[family.id] = 0;
    roleAssignments[family.id] = {};
    for (const role of teamDutyRoles) {
      roleAssignments[family.id][role.id] = 0;
    }
  }

  const assignments: RosterOutput[] = [];

  const activeRounds = rounds
    .filter((r) => !r.isBye)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  for (const round of activeRounds) {
    const roundIndex = activeRounds.indexOf(round);

    for (const role of teamDutyRoles) {
      // FIXED: same person every round
      if (role.roleType === "FIXED") {
        if (role.assignedUserId) {
          assignments.push({
            roundId: round.id,
            teamDutyRoleId: role.id,
            assignedFamilyId: role.assignedUserId,
            slot: 0,
          });
        }
        continue;
      }

      // FREQUENCY: skip rounds that don't match the cadence
      if (role.roleType === "FREQUENCY" && role.frequencyWeeks > 1) {
        if (roundIndex % role.frequencyWeeks !== 0) continue;
      }

      const slotsToFill = role.slots ?? 1;
      const chosenThisRole: string[] = [];

      for (let slot = 0; slot < slotsToFill; slot++) {
        // Determine eligible families
        const eligiblePool = role.roleType === "SPECIALIST"
          ? families.filter((f) => role.specialistFamilyIds.includes(f.id))
          : families;

        const eligible = eligiblePool.filter((f) => {
          if (exclusionSet.has(`${f.id}:${role.id}`)) return false;
          if (unavailabilitySet.has(`${f.id}:${round.id}`)) return false;
          // Don't assign same family to multiple roles in one round
          const alreadyAssigned = assignments.some(
            (a) => a.roundId === round.id && a.assignedFamilyId === f.id
          );
          if (alreadyAssigned) return false;
          // Don't assign same family to multiple slots of the same role
          if (chosenThisRole.includes(f.id)) return false;
          return true;
        });

        if (eligible.length === 0) continue;

        // Sort: fewest total assignments, then fewest for this role
        eligible.sort((a, b) => {
          const totalDiff = totalAssignments[a.id] - totalAssignments[b.id];
          if (totalDiff !== 0) return totalDiff;
          return (
            roleAssignments[a.id][role.id] - roleAssignments[b.id][role.id]
          );
        });

        const chosen = eligible[0];
        assignments.push({
          roundId: round.id,
          teamDutyRoleId: role.id,
          assignedFamilyId: chosen.id,
          slot,
        });
        totalAssignments[chosen.id]++;
        roleAssignments[chosen.id][role.id]++;
        chosenThisRole.push(chosen.id);
      }
    }
  }

  return assignments;
}
