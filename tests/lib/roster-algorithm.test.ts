import { describe, it, expect } from "vitest";
import { generateRoster, resolveDisplayName, deriveFamilyMembers, deriveFamilies, deriveFamiliesWithPlayers } from "../../src/lib/roster-algorithm";

describe("generateRoster", () => {
  const baseRounds = [
    { id: "r1", roundNumber: 1, isBye: false },
    { id: "r2", roundNumber: 2, isBye: false },
    { id: "r3", roundNumber: 3, isBye: false },
  ];

  const baseFamilies = [
    { id: "family_smith", name: "Smith" },
    { id: "family_jones", name: "Jones" },
    { id: "family_brown", name: "Brown" },
  ];

  it("generates assignments for ROTATING roles", () => {
    const input = {
      rounds: baseRounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(3); // one per round
    // Each round should have a different family (fair distribution)
    const familyIds = result.map((a) => a.assignedFamilyId);
    expect(new Set(familyIds).size).toBe(3);
  });

  it("generates assignments for FIXED roles", () => {
    const input = {
      rounds: baseRounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Coach", roleType: "FIXED" as const, assignedFamilyId: "family_smith", frequencyWeeks: 1, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(3);
    expect(result.every((a) => a.assignedFamilyId === "family_smith")).toBe(true);
  });

  it("skips bye rounds", () => {
    const rounds = [
      { id: "r1", roundNumber: 1, isBye: false },
      { id: "r2", roundNumber: 2, isBye: true },
      { id: "r3", roundNumber: 3, isBye: false },
    ];

    const input = {
      rounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(2);
    expect(result.find((a) => a.roundId === "r2")).toBeUndefined();
  });

  it("respects unavailabilities", () => {
    const input = {
      rounds: [{ id: "r1", roundNumber: 1, isBye: false }],
      families: [
        { id: "family_smith", name: "Smith" },
        { id: "family_jones", name: "Jones" },
      ],
      teamDutyRoles: [
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [{ familyId: "family_smith", roundId: "r1" }],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(1);
    expect(result[0].assignedFamilyId).toBe("family_jones");
  });

  it("respects FREQUENCY role cadence", () => {
    const rounds = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 1}`,
      roundNumber: i + 1,
      isBye: false,
    }));

    const input = {
      rounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Photographer", roleType: "FREQUENCY" as const, assignedFamilyId: null, frequencyWeeks: 3, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(2); // rounds 1 and 4 (index 0 and 3)
  });

  it("limits SPECIALIST roles to eligible families", () => {
    const input = {
      rounds: [{ id: "r1", roundNumber: 1, isBye: false }],
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Umpire", roleType: "SPECIALIST" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: ["family_jones"] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(1);
    expect(result[0].assignedFamilyId).toBe("family_jones");
  });

  it("returns empty when no families provided", () => {
    const input = {
      rounds: baseRounds,
      families: [],
      teamDutyRoles: [
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(0);
  });

  it("generates multiple assignments per round when slots > 1", () => {
    const input = {
      rounds: baseRounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, slots: 2, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    // 3 rounds × 2 slots = 6 assignments
    expect(result.length).toBe(6);

    // Each round should have exactly 2 assignments with different families and different slot numbers
    for (const round of baseRounds) {
      const roundAssignments = result.filter((a) => a.roundId === round.id);
      expect(roundAssignments.length).toBe(2);
      expect(roundAssignments[0].assignedFamilyId).not.toBe(roundAssignments[1].assignedFamilyId);
      expect(roundAssignments.map((a) => a.slot).sort()).toEqual([0, 1]);
    }
  });

  it("does not assign the same family to multiple slots of the same role in one round", () => {
    const input = {
      rounds: [{ id: "r1", roundNumber: 1, isBye: false }],
      families: [
        { id: "family_smith", name: "Smith" },
        { id: "family_jones", name: "Jones" },
        { id: "family_brown", name: "Brown" },
      ],
      teamDutyRoles: [
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, slots: 3, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(3);
    const familyIds = result.map((a) => a.assignedFamilyId);
    expect(new Set(familyIds).size).toBe(3); // all different families
  });

  it("fills fewer slots when not enough eligible families", () => {
    const input = {
      rounds: [{ id: "r1", roundNumber: 1, isBye: false }],
      families: [
        { id: "family_smith", name: "Smith" },
      ],
      teamDutyRoles: [
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, slots: 3, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    // Only 1 family available, so only 1 slot can be filled
    expect(result.length).toBe(1);
    expect(result[0].slot).toBe(0);
  });

  it("rotates SPECIALIST roles with slots > 1 among eligible families", () => {
    const rounds = Array.from({ length: 4 }, (_, i) => ({
      id: `r${i + 1}`,
      roundNumber: i + 1,
      isBye: false,
    }));

    const input = {
      rounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Umpire", roleType: "SPECIALIST" as const, assignedFamilyId: null, frequencyWeeks: 1, slots: 2, specialistFamilyIds: ["family_smith", "family_jones", "family_brown"] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    // 4 rounds × 2 slots = 8 assignments
    expect(result.length).toBe(8);

    // Each round has 2 different families
    for (const round of rounds) {
      const roundAssignments = result.filter((a) => a.roundId === round.id);
      expect(roundAssignments.length).toBe(2);
      expect(roundAssignments[0].assignedFamilyId).not.toBe(roundAssignments[1].assignedFamilyId);
    }
  });

  it("handles external specialists not in the main families list", () => {
    const externalFamilies = [
      ...baseFamilies,
      { id: "external_uncle_dave", name: "Uncle Dave" },
    ];

    const input = {
      rounds: [{ id: "r1", roundNumber: 1, isBye: false }],
      families: externalFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Umpire", roleType: "SPECIALIST" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: ["external_uncle_dave"] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    expect(result.length).toBe(1);
    expect(result[0].assignedFamilyId).toBe("external_uncle_dave");
  });

  it("distributes duties fairly across families", () => {
    const rounds = Array.from({ length: 9 }, (_, i) => ({
      id: `r${i + 1}`,
      roundNumber: i + 1,
      isBye: false,
    }));

    const input = {
      rounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    // Each family should get exactly 3 assignments (9 rounds / 3 families)
    const counts: Record<string, number> = {};
    for (const a of result) {
      counts[a.assignedFamilyId] = (counts[a.assignedFamilyId] || 0) + 1;
    }
    expect(Object.values(counts).every((c) => c === 3)).toBe(true);
  });

  it("fixed-role families still get assigned to rotating roles", () => {
    const rounds = Array.from({ length: 3 }, (_, i) => ({
      id: `r${i + 1}`,
      roundNumber: i + 1,
      isBye: false,
    }));

    const input = {
      rounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr_coach", roleName: "Coach", roleType: "FIXED" as const, assignedFamilyId: "family_smith", frequencyWeeks: 1, specialistFamilyIds: [] },
        { id: "tdr_canteen", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    const canteenAssignments = result.filter((a) => a.teamDutyRoleId === "tdr_canteen");
    // Smith is coach (fixed) but should still get canteen duty
    expect(canteenAssignments.some((a) => a.assignedFamilyId === "family_smith")).toBe(true);
    // All 3 families should get canteen duties (3 rounds, 3 families)
    const canteenFamilies = new Set(canteenAssignments.map((a) => a.assignedFamilyId));
    expect(canteenFamilies.size).toBe(3);
  });

  it("specialist-role families still get assigned to rotating roles", () => {
    const input = {
      rounds: baseRounds,
      families: baseFamilies,
      teamDutyRoles: [
        { id: "tdr_umpire", roleName: "Umpire", roleType: "SPECIALIST" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: ["family_jones"] },
        { id: "tdr_canteen", roleName: "Canteen", roleType: "ROTATING" as const, assignedFamilyId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    const canteenAssignments = result.filter((a) => a.teamDutyRoleId === "tdr_canteen");
    // Jones is umpire (specialist) but should still get canteen duty
    expect(canteenAssignments.some((a) => a.assignedFamilyId === "family_jones")).toBe(true);
  });
});

describe("resolveDisplayName", () => {
  const familyMap = new Map([
    ["family_lawson", { id: "family_lawson", name: "Lawson" }],
    ["family_smith", { id: "family_smith", name: "Smith" }],
    ["external_uncle_dave", { id: "external_uncle_dave", name: "Uncle Dave" }],
  ]);

  it("returns person name for SPECIALIST roles (family-linked)", () => {
    const input = {
      teamDutyRoles: [{
        id: "tdr1",
        roleType: "SPECIALIST" as const,
        assignedFamilyId: null,
        assignedPersonName: null,
        specialists: [
          { personName: "Kylie", familyId: "family_lawson" },
          { personName: "Grant", familyId: "family_smith" },
        ],
      }],
      familyMap,
    };

    expect(resolveDisplayName(input, { teamDutyRoleId: "tdr1", assignedFamilyId: "family_lawson" })).toBe("Kylie");
    expect(resolveDisplayName(input, { teamDutyRoleId: "tdr1", assignedFamilyId: "family_smith" })).toBe("Grant");
  });

  it("returns person name for SPECIALIST roles (external person)", () => {
    const input = {
      teamDutyRoles: [{
        id: "tdr1",
        roleType: "SPECIALIST" as const,
        assignedFamilyId: null,
        assignedPersonName: null,
        specialists: [
          { personName: "Uncle Dave", familyId: null },
        ],
      }],
      familyMap,
    };

    expect(resolveDisplayName(input, { teamDutyRoleId: "tdr1", assignedFamilyId: "external_uncle_dave" })).toBe("Uncle Dave");
  });

  it("returns person name for FIXED roles", () => {
    const input = {
      teamDutyRoles: [{
        id: "tdr1",
        roleType: "FIXED" as const,
        assignedFamilyId: "family_lawson",
        assignedPersonName: "Kylie",
        specialists: [],
      }],
      familyMap,
    };

    expect(resolveDisplayName(input, { teamDutyRoleId: "tdr1", assignedFamilyId: "family_lawson" })).toBe("Kylie");
  });

  it("returns family surname for ROTATING roles", () => {
    const input = {
      teamDutyRoles: [{
        id: "tdr1",
        roleType: "ROTATING" as const,
        assignedFamilyId: null,
        assignedPersonName: null,
        specialists: [],
      }],
      familyMap,
    };

    expect(resolveDisplayName(input, { teamDutyRoleId: "tdr1", assignedFamilyId: "family_lawson" })).toBe("Lawson");
  });

  it("returns family surname for FREQUENCY roles", () => {
    const input = {
      teamDutyRoles: [{
        id: "tdr1",
        roleType: "FREQUENCY" as const,
        assignedFamilyId: null,
        assignedPersonName: null,
        specialists: [],
      }],
      familyMap,
    };

    expect(resolveDisplayName(input, { teamDutyRoleId: "tdr1", assignedFamilyId: "family_smith" })).toBe("Smith");
  });

  it("falls back to familyId when family not in map", () => {
    const input = {
      teamDutyRoles: [{
        id: "tdr1",
        roleType: "ROTATING" as const,
        assignedFamilyId: null,
        assignedPersonName: null,
        specialists: [],
      }],
      familyMap: new Map(),
    };

    expect(resolveDisplayName(input, { teamDutyRoleId: "tdr1", assignedFamilyId: "family_unknown" })).toBe("family_unknown");
  });
});

describe("deriveFamilyMembers", () => {
  it("derives family members from parent1 and parent2", () => {
    const players = [
      { surname: "Lawson", parent1: "Kylie", parent2: "Ben" },
      { surname: "Smith", parent1: "Grant", parent2: null },
    ];

    const result = deriveFamilyMembers(players);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ familyId: "family_lawson", personName: "Kylie", label: "Kylie (Lawson)" });
    expect(result).toContainEqual({ familyId: "family_lawson", personName: "Ben", label: "Ben (Lawson)" });
    expect(result).toContainEqual({ familyId: "family_smith", personName: "Grant", label: "Grant (Smith)" });
  });

  it("deduplicates when siblings share the same parents", () => {
    const players = [
      { surname: "Lawson", parent1: "Kylie", parent2: "Ben" },
      { surname: "Lawson", parent1: "Kylie", parent2: "Ben" }, // sibling
    ];

    const result = deriveFamilyMembers(players);
    expect(result).toHaveLength(2); // Kylie and Ben, not duplicated
  });

  it("skips null and empty parent names", () => {
    const players = [
      { surname: "Lawson", parent1: "Kylie", parent2: null },
      { surname: "Smith", parent1: "", parent2: "  " },
    ];

    const result = deriveFamilyMembers(players);
    expect(result).toHaveLength(1);
    expect(result[0].personName).toBe("Kylie");
  });

  it("trims whitespace from parent names", () => {
    const players = [
      { surname: "Lawson", parent1: "  Kylie  ", parent2: null },
    ];

    const result = deriveFamilyMembers(players);
    expect(result[0].personName).toBe("Kylie");
    expect(result[0].label).toBe("Kylie (Lawson)");
  });

  it("returns sorted by label", () => {
    const players = [
      { surname: "Zane", parent1: "Zara", parent2: null },
      { surname: "Alexander", parent1: "Alex", parent2: null },
    ];

    const result = deriveFamilyMembers(players);
    expect(result[0].label).toBe("Alex (Alexander)");
    expect(result[1].label).toBe("Zara (Zane)");
  });

  it("returns empty array when no players", () => {
    expect(deriveFamilyMembers([])).toEqual([]);
  });

  it("handles surnames with spaces", () => {
    const players = [
      { surname: "Van Der Berg", parent1: "Jan", parent2: null },
    ];

    const result = deriveFamilyMembers(players);
    expect(result[0].familyId).toBe("family_van_der_berg");
    expect(result[0].label).toBe("Jan (Van Der Berg)");
  });
});

describe("deriveFamilies", () => {
  it("returns one family per unique surname", () => {
    const players = [
      { surname: "Smith", firstName: "Tom", parent1: "Grant" },
      { surname: "Jones", firstName: "Amy", parent1: "Sarah" },
    ];
    const result = deriveFamilies(players);
    expect(result).toHaveLength(2);
    expect(result.find((f) => f.id === "family_smith")).toBeDefined();
    expect(result.find((f) => f.id === "family_jones")).toBeDefined();
  });

  it("returns one family for siblings with the same surname and parent1", () => {
    const players = [
      { surname: "Smith", firstName: "Tom", parent1: "Grant" },
      { surname: "Smith", firstName: "Lucy", parent1: "Grant" }, // sibling
    ];
    const result = deriveFamilies(players);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("family_smith");
    expect(result[0].name).toBe("Smith");
  });

  it("disambiguates families with same surname but different parent1", () => {
    const players = [
      { surname: "Smith", firstName: "Tom", parent1: "Grant" },
      { surname: "Smith", firstName: "Ella", parent1: "John" },
    ];
    const result = deriveFamilies(players);
    expect(result).toHaveLength(2);
    expect(result.find((f) => f.id === "family_smith_grant")).toBeDefined();
    expect(result.find((f) => f.id === "family_smith_john")).toBeDefined();
    expect(result.find((f) => f.name === "Smith (Grant)")).toBeDefined();
    expect(result.find((f) => f.name === "Smith (John)")).toBeDefined();
  });

  it("treats twins (same surname, same parent1) as one family", () => {
    const players = [
      { surname: "Smith", firstName: "Tom", parent1: "Grant" },
      { surname: "Smith", firstName: "Tim", parent1: "Grant" }, // twin
    ];
    const result = deriveFamilies(players);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("family_smith");
  });

  it("handles surnames with spaces", () => {
    const players = [
      { surname: "Van Der Berg", firstName: "Jan", parent1: "Pieter" },
    ];
    const result = deriveFamilies(players);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("family_van_der_berg");
    expect(result[0].name).toBe("Van Der Berg");
  });

  it("returns empty array for empty input", () => {
    expect(deriveFamilies([])).toEqual([]);
  });

  it("merges into one family when all players share a surname and have no parent1", () => {
    const players = [
      { surname: "Smith", firstName: "Tom", parent1: null },
      { surname: "Smith", firstName: "Ella", parent1: null },
    ];
    const result = deriveFamilies(players);
    // No parent1 to disambiguate — treat as one family
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("family_smith");
  });

  it("trims whitespace from parent1 before disambiguation", () => {
    const players = [
      { surname: "Smith", firstName: "Tom", parent1: "  Grant  " },
      { surname: "Smith", firstName: "Ella", parent1: "Grant" }, // same after trim
    ];
    const result = deriveFamilies(players);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("family_smith");
  });
});

describe("deriveFamiliesWithPlayers", () => {
  it("groups siblings under one family and lists their playerIds", () => {
    const players = [
      { id: "p1", surname: "Smith", firstName: "Tom", parent1: "Jane" },
      { id: "p2", surname: "Smith", firstName: "Ella", parent1: "Jane" },
      { id: "p3", surname: "Jones", firstName: "Sam", parent1: "Kate" },
    ];
    const result = deriveFamiliesWithPlayers(players);
    const smith = result.find((f) => f.id === "family_smith");
    const jones = result.find((f) => f.id === "family_jones");
    expect(smith?.playerIds.sort()).toEqual(["p1", "p2"]);
    expect(jones?.playerIds).toEqual(["p3"]);
  });

  it("disambiguates two Smith families by parent1 and maps each player to its own family", () => {
    const players = [
      { id: "p1", surname: "Smith", firstName: "Tom", parent1: "Jane" },
      { id: "p2", surname: "Smith", firstName: "Liam", parent1: "Marco" },
    ];
    const result = deriveFamiliesWithPlayers(players);
    expect(result).toHaveLength(2);
    const jane = result.find((f) => f.id === "family_smith_jane");
    const marco = result.find((f) => f.id === "family_smith_marco");
    expect(jane?.playerIds).toEqual(["p1"]);
    expect(marco?.playerIds).toEqual(["p2"]);
  });
});
