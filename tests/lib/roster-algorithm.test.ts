import { describe, it, expect } from "vitest";
import { generateRoster } from "../../src/lib/roster-algorithm";

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
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedUserId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
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
        { id: "tdr1", roleName: "Coach", roleType: "FIXED" as const, assignedUserId: "family_smith", frequencyWeeks: 1, specialistFamilyIds: [] },
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
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedUserId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
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
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedUserId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
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
        { id: "tdr1", roleName: "Photographer", roleType: "FREQUENCY" as const, assignedUserId: null, frequencyWeeks: 3, specialistFamilyIds: [] },
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
        { id: "tdr1", roleName: "Umpire", roleType: "SPECIALIST" as const, assignedUserId: null, frequencyWeeks: 1, specialistFamilyIds: ["family_jones"] },
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
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedUserId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
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
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedUserId: null, frequencyWeeks: 1, slots: 2, specialistFamilyIds: [] },
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
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedUserId: null, frequencyWeeks: 1, slots: 3, specialistFamilyIds: [] },
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
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedUserId: null, frequencyWeeks: 1, slots: 3, specialistFamilyIds: [] },
      ],
      exclusions: [],
      unavailabilities: [],
    };

    const result = generateRoster(input);
    // Only 1 family available, so only 1 slot can be filled
    expect(result.length).toBe(1);
    expect(result[0].slot).toBe(0);
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
        { id: "tdr1", roleName: "Canteen", roleType: "ROTATING" as const, assignedUserId: null, frequencyWeeks: 1, specialistFamilyIds: [] },
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
});
