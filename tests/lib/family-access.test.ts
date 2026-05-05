import { vi, describe, test, expect, beforeEach } from "vitest";

// vi.mock factories are hoisted before variable declarations.
// Use vi.hoisted() to create the mock objects at hoist time so they can be
// referenced inside the vi.mock factory below.
const { mockTeamPlayer, mockFamilyTeamAccess } = vi.hoisted(() => ({
  mockTeamPlayer: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  mockFamilyTeamAccess: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamPlayer: mockTeamPlayer,
    familyTeamAccess: mockFamilyTeamAccess,
  },
}));

import { getFamilyAccessibleTeams, canFamilyAccessTeam } from "@/lib/family-access";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getFamilyAccessibleTeams
// ---------------------------------------------------------------------------
describe("getFamilyAccessibleTeams", () => {
  test("returns union of player-derived and manual team IDs", async () => {
    mockTeamPlayer.findMany.mockResolvedValue([{ teamId: "team-a" }, { teamId: "team-b" }]);
    mockFamilyTeamAccess.findMany.mockResolvedValue([
      { teamId: "team-b" }, // overlap — deduplicated
      { teamId: "team-c" },
    ]);

    const result = await getFamilyAccessibleTeams("fam-1", "club-1");

    expect(result).toHaveLength(3);
    expect(result).toContain("team-a");
    expect(result).toContain("team-b");
    expect(result).toContain("team-c");
  });

  test("returns only player-derived teams when no manual grants exist", async () => {
    mockTeamPlayer.findMany.mockResolvedValue([{ teamId: "team-a" }]);
    mockFamilyTeamAccess.findMany.mockResolvedValue([]);

    const result = await getFamilyAccessibleTeams("fam-1", "club-1");

    expect(result).toEqual(["team-a"]);
  });

  test("returns only manual teams when no player links exist", async () => {
    mockTeamPlayer.findMany.mockResolvedValue([]);
    mockFamilyTeamAccess.findMany.mockResolvedValue([{ teamId: "team-x" }]);

    const result = await getFamilyAccessibleTeams("fam-1", "club-1");

    expect(result).toEqual(["team-x"]);
  });

  test("returns empty array when no access from either source", async () => {
    mockTeamPlayer.findMany.mockResolvedValue([]);
    mockFamilyTeamAccess.findMany.mockResolvedValue([]);

    const result = await getFamilyAccessibleTeams("fam-1", "club-1");

    expect(result).toHaveLength(0);
  });

  test("deduplicates when the same team appears via both sources", async () => {
    mockTeamPlayer.findMany.mockResolvedValue([{ teamId: "team-a" }, { teamId: "team-b" }]);
    mockFamilyTeamAccess.findMany.mockResolvedValue([{ teamId: "team-a" }, { teamId: "team-b" }]);

    const result = await getFamilyAccessibleTeams("fam-1", "club-1");

    expect(result).toHaveLength(2);
    expect(result).toContain("team-a");
    expect(result).toContain("team-b");
  });

  test("passes clubId to both queries so access is scoped to the right club", async () => {
    mockTeamPlayer.findMany.mockResolvedValue([]);
    mockFamilyTeamAccess.findMany.mockResolvedValue([]);

    await getFamilyAccessibleTeams("fam-1", "club-99");

    expect(mockTeamPlayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ player: expect.objectContaining({ clubId: "club-99" }) }) })
    );
    expect(mockFamilyTeamAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clubId: "club-99" }) })
    );
  });
});

// ---------------------------------------------------------------------------
// canFamilyAccessTeam
// ---------------------------------------------------------------------------
describe("canFamilyAccessTeam", () => {
  test("returns true when manual FamilyTeamAccess row exists with matching clubId", async () => {
    mockFamilyTeamAccess.findUnique.mockResolvedValue({ clubId: "club-1" });
    mockTeamPlayer.findFirst.mockResolvedValue(null);

    const result = await canFamilyAccessTeam("fam-1", "team-1", "club-1");

    expect(result).toBe(true);
  });

  test("returns true when player-derived access exists", async () => {
    mockFamilyTeamAccess.findUnique.mockResolvedValue(null);
    mockTeamPlayer.findFirst.mockResolvedValue({ id: "tp-1" });

    const result = await canFamilyAccessTeam("fam-1", "team-1", "club-1");

    expect(result).toBe(true);
  });

  test("returns false when no access from either source", async () => {
    mockFamilyTeamAccess.findUnique.mockResolvedValue(null);
    mockTeamPlayer.findFirst.mockResolvedValue(null);

    const result = await canFamilyAccessTeam("fam-1", "team-1", "club-1");

    expect(result).toBe(false);
  });

  test("returns false when FamilyTeamAccess row exists but clubId mismatches (cross-club)", async () => {
    // A row exists but it belongs to a different club — must be rejected.
    mockFamilyTeamAccess.findUnique.mockResolvedValue({ clubId: "other-club" });
    mockTeamPlayer.findFirst.mockResolvedValue(null);

    const result = await canFamilyAccessTeam("fam-1", "team-1", "club-1");

    expect(result).toBe(false);
  });

  test("returns true even when manual access is present alongside player access (both valid)", async () => {
    mockFamilyTeamAccess.findUnique.mockResolvedValue({ clubId: "club-1" });
    mockTeamPlayer.findFirst.mockResolvedValue({ id: "tp-1" });

    const result = await canFamilyAccessTeam("fam-1", "team-1", "club-1");

    expect(result).toBe(true);
  });

  test("passes correct familyUserId and teamId to the unique query", async () => {
    mockFamilyTeamAccess.findUnique.mockResolvedValue(null);
    mockTeamPlayer.findFirst.mockResolvedValue(null);

    await canFamilyAccessTeam("fam-42", "team-99", "club-1");

    expect(mockFamilyTeamAccess.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyUserId_teamId: { familyUserId: "fam-42", teamId: "team-99" } },
      })
    );
  });
});
