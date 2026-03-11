interface RosterInput {
  rounds: { id: string; roundNumber: number; isBye: boolean }[];
  families: { id: string; name: string }[];
  dutyRoles: { id: string; roleName: string }[];
  exclusions: { familyId: string; dutyRoleParentId: string }[];
  unavailabilities: { familyId: string; roundId: string }[];
}

interface RosterOutput {
  roundId: string;
  dutyRoleParentId: string;
  assignedFamilyId: string;
}

export function generateRoster(input: RosterInput): RosterOutput[] {
  const { rounds, families, dutyRoles, exclusions, unavailabilities } = input;

  const exclusionSet = new Set(
    exclusions.map((e) => `${e.familyId}:${e.dutyRoleParentId}`)
  );
  const unavailabilitySet = new Set(
    unavailabilities.map((u) => `${u.familyId}:${u.roundId}`)
  );

  // Track assignment counts
  const totalAssignments: Record<string, number> = {};
  const roleAssignments: Record<string, Record<string, number>> = {};
  for (const family of families) {
    totalAssignments[family.id] = 0;
    roleAssignments[family.id] = {};
    for (const role of dutyRoles) {
      roleAssignments[family.id][role.id] = 0;
    }
  }

  const assignments: RosterOutput[] = [];

  const activeRounds = rounds
    .filter((r) => !r.isBye)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  for (const round of activeRounds) {
    for (const role of dutyRoles) {
      // Get eligible families
      const eligible = families.filter((f) => {
        if (exclusionSet.has(`${f.id}:${role.id}`)) return false;
        if (unavailabilitySet.has(`${f.id}:${round.id}`)) return false;
        // Check if already assigned to another role this round
        const alreadyAssigned = assignments.some(
          (a) => a.roundId === round.id && a.assignedFamilyId === f.id
        );
        if (alreadyAssigned) return false;
        return true;
      });

      if (eligible.length === 0) continue;

      // Sort: fewest total, then fewest for this role
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
        dutyRoleParentId: role.id,
        assignedFamilyId: chosen.id,
      });
      totalAssignments[chosen.id]++;
      roleAssignments[chosen.id][role.id]++;
    }
  }

  return assignments;
}
