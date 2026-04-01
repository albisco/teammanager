/**
 * Derives unique family entries from a list of players, grouped by surname.
 * When two players share a surname but have different parent1 values, they are
 * treated as different families and disambiguated with the parent1 name.
 * Siblings and twins with the same parent share one family entry.
 */
export function deriveFamilies(
  players: { surname: string; firstName: string; parent1?: string | null }[]
): { id: string; name: string }[] {
  // Group players by normalised surname key
  const bySurname = new Map<string, Array<{ surname: string; firstName: string; parent1?: string | null }>>();
  for (const p of players) {
    const key = p.surname.toLowerCase().replace(/\s+/g, "_");
    if (!bySurname.has(key)) bySurname.set(key, []);
    bySurname.get(key)!.push(p);
  }

  const families: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const [surnameKey, group] of bySurname) {
    const distinctParents = [
      ...new Set(group.map((p) => p.parent1?.trim()).filter(Boolean) as string[]),
    ];

    if (distinctParents.length <= 1) {
      // One family for this surname
      const familyId = `family_${surnameKey}`;
      if (!seen.has(familyId)) {
        seen.add(familyId);
        families.push({ id: familyId, name: group[0].surname });
      }
    } else {
      // Multiple distinct parents → separate families, disambiguate by parent1
      const handled = new Set<string>();
      for (const p of group) {
        const parent = p.parent1?.trim() || p.firstName;
        if (handled.has(parent)) continue;
        handled.add(parent);
        const parentKey = parent.toLowerCase().replace(/\s+/g, "_");
        const familyId = `family_${surnameKey}_${parentKey}`;
        if (!seen.has(familyId)) {
          seen.add(familyId);
          families.push({ id: familyId, name: `${group[0].surname} (${parent})` });
        }
      }
    }
  }

  return families;
}

interface RosterInput {
  rounds: { id: string; roundNumber: number; isBye: boolean }[];
  families: { id: string; name: string }[];
  teamDutyRoles: {
    id: string;
    roleName: string;
    roleType: "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY";
    assignedFamilyId?: string | null;
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
        if (role.assignedFamilyId) {
          assignments.push({
            roundId: round.id,
            teamDutyRoleId: role.id,
            assignedFamilyId: role.assignedFamilyId,
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
          // Don't assign same family to multiple rotating/frequency roles in one round
          // (fixed/specialist assignments don't block a family from other duties)
          const alreadyAssignedRotating = assignments.some(
            (a) => a.roundId === round.id && a.assignedFamilyId === f.id &&
              teamDutyRoles.find((r) => r.id === a.teamDutyRoleId)?.roleType !== "FIXED" &&
              teamDutyRoles.find((r) => r.id === a.teamDutyRoleId)?.roleType !== "SPECIALIST"
          );
          if (alreadyAssignedRotating) return false;
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
        // Only count rotating/frequency assignments for fairness distribution
        if (role.roleType === "ROTATING" || role.roleType === "FREQUENCY") {
          totalAssignments[chosen.id]++;
        }
        roleAssignments[chosen.id][role.id]++;
        chosenThisRole.push(chosen.id);
      }
    }
  }

  return assignments;
}

interface DisplayNameInput {
  teamDutyRoles: {
    id: string;
    roleType: "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY";
    assignedFamilyId?: string | null;
    assignedPersonName?: string | null;
    specialists: { personName: string; familyId: string | null }[];
  }[];
  familyMap: Map<string, { id: string; name: string }>;
}

/**
 * Resolves the display name for a roster assignment.
 * For SPECIALIST/FIXED roles, returns the person's name (e.g. "Kylie").
 * For ROTATING/FREQUENCY roles, returns the family surname (e.g. "Lawson").
 */
export function resolveDisplayName(
  input: DisplayNameInput,
  assignment: { teamDutyRoleId: string; assignedFamilyId: string }
): string {
  for (const tdr of input.teamDutyRoles) {
    if (tdr.id !== assignment.teamDutyRoleId) continue;

    if (tdr.roleType === "FIXED" && tdr.assignedFamilyId && tdr.assignedPersonName) {
      if (assignment.assignedFamilyId === tdr.assignedFamilyId) {
        const surname = input.familyMap.get(tdr.assignedFamilyId)?.name;
        return surname ? `${tdr.assignedPersonName} ${surname}` : tdr.assignedPersonName;
      }
    }

    if (tdr.roleType === "SPECIALIST") {
      for (const s of tdr.specialists) {
        const fId = s.familyId || `external_${s.personName.toLowerCase().replace(/\s+/g, "_")}`;
        if (assignment.assignedFamilyId === fId) {
          // Full name: "Gav Prendergast" for family-linked, just name for external
          const surname = s.familyId ? input.familyMap.get(s.familyId)?.name : null;
          return surname ? `${s.personName} ${surname}` : s.personName;
        }
      }
    }

    break;
  }

  return input.familyMap.get(assignment.assignedFamilyId)?.name || assignment.assignedFamilyId;
}

/**
 * Derives unique family members (parents) from team players for specialist/fixed role configuration.
 * Returns deduplicated, sorted list with labels like "Kylie (Lawson)".
 */
export function deriveFamilyMembers(
  players: { surname: string; parent1: string | null; parent2: string | null }[]
): { familyId: string; personName: string; label: string }[] {
  const seen = new Set<string>();
  const members: { familyId: string; personName: string; label: string }[] = [];

  for (const player of players) {
    const familyId = `family_${player.surname.toLowerCase().replace(/\s+/g, "_")}`;
    for (const parentName of [player.parent1, player.parent2]) {
      if (!parentName?.trim()) continue;
      const name = parentName.trim();
      const key = `${familyId}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        members.push({ familyId, personName: name, label: `${name} (${player.surname})` });
      }
    }
  }

  return members.sort((a, b) => a.label.localeCompare(b.label));
}
