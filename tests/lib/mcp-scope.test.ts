import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the MCP role-based scope helpers.
 *
 * Mocks @/lib/prisma so every test runs without a real DB and can control
 * the exact return values for the three queries buildScope makes:
 *   - prisma.team.findMany       (ADMIN: all teams in their club)
 *   - prisma.player.findMany     (ADMIN + FAMILY: club players / my players)
 *   - prisma.teamPlayer.findMany (TEAM_MANAGER: players on managed teams)
 *
 * The regression tests at #12 and #19 explicitly cover the cross-club data
 * leak that was fixed in commit 7f7147c — if ADMIN's allowedTeamIds or
 * allowedPlayerIds ever goes back to `"all"`, those tests will fail.
 */

const { teamFindMany, playerFindMany, teamPlayerFindMany } = vi.hoisted(() => ({
  teamFindMany: vi.fn(),
  playerFindMany: vi.fn(),
  teamPlayerFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    team: { findMany: teamFindMany },
    player: { findMany: playerFindMany },
    teamPlayer: { findMany: teamPlayerFindMany },
  },
}));

import {
  buildScope,
  assertTeamAccess,
  assertPlayerAccess,
  assertFamilyAccess,
  assertRole,
  teamWhereClause,
} from "@/lib/mcp/scope";
import { McpError, ErrorCodes, type AuthedUser, type Scope } from "@/lib/mcp/types";

beforeEach(() => {
  teamFindMany.mockReset();
  playerFindMany.mockReset();
  teamPlayerFindMany.mockReset();
});

/* ─── Fixtures ──────────────────────────────────────────────────────────── */

function superAdminUser(): AuthedUser {
  return {
    id: "u_super",
    email: "super@example.com",
    name: "Super Admin",
    role: "SUPER_ADMIN",
    clubId: null,
    managedTeamIds: [],
    playerIds: [],
  };
}

function adminUser(clubId: string | null = "club_a"): AuthedUser {
  return {
    id: "u_admin",
    email: "admin@example.com",
    name: "Admin",
    role: "ADMIN",
    clubId,
    managedTeamIds: [],
    playerIds: [],
  };
}

function teamManagerUser(
  managedTeamIds: string[],
  clubId: string | null = "club_a"
): AuthedUser {
  return {
    id: "u_tm",
    email: "tm@example.com",
    name: "Team Manager",
    role: "TEAM_MANAGER",
    clubId,
    managedTeamIds,
    playerIds: [],
  };
}

function familyUser(playerIds: string[], clubId: string | null = "club_a"): AuthedUser {
  return {
    id: "u_fam",
    email: "fam@example.com",
    name: "Family",
    role: "FAMILY",
    clubId,
    managedTeamIds: [],
    playerIds,
  };
}

/* ─── buildScope ────────────────────────────────────────────────────────── */

describe("buildScope — SUPER_ADMIN", () => {
  it("returns unrestricted scope with no DB calls", async () => {
    const scope = await buildScope(superAdminUser());
    expect(scope.role).toBe("SUPER_ADMIN");
    expect(scope.clubId).toBeNull();
    expect(scope.allowedTeamIds).toBe("all");
    expect(scope.allowedPlayerIds).toBe("all");
    expect(scope.allowedFamilyIds).toBe("all");
    expect(teamFindMany).not.toHaveBeenCalled();
    expect(playerFindMany).not.toHaveBeenCalled();
    expect(teamPlayerFindMany).not.toHaveBeenCalled();
  });
});

describe("buildScope — ADMIN", () => {
  it("throws Forbidden when clubId is missing", async () => {
    await expect(buildScope(adminUser(null))).rejects.toMatchObject({
      code: ErrorCodes.Forbidden,
    });
  });

  it("queries club teams and players and returns concrete ID lists", async () => {
    teamFindMany.mockResolvedValue([{ id: "team_1" }, { id: "team_2" }]);
    playerFindMany.mockResolvedValue([{ id: "p_1" }, { id: "p_2" }, { id: "p_3" }]);

    const scope = await buildScope(adminUser("club_a"));

    expect(teamFindMany).toHaveBeenCalledWith({
      where: { season: { clubId: "club_a" } },
      select: { id: true },
    });
    expect(playerFindMany).toHaveBeenCalledWith({
      where: { clubId: "club_a" },
      select: { id: true },
    });

    expect(scope.role).toBe("ADMIN");
    expect(scope.clubId).toBe("club_a");
    expect(scope.allowedTeamIds).toEqual(["team_1", "team_2"]);
    expect(scope.allowedPlayerIds).toEqual(["p_1", "p_2", "p_3"]);
    expect(scope.allowedFamilyIds).toBe("all");
  });
});

describe("buildScope — TEAM_MANAGER", () => {
  it("throws Forbidden when clubId is missing", async () => {
    await expect(buildScope(teamManagerUser(["team_1"], null))).rejects.toMatchObject({
      code: ErrorCodes.Forbidden,
    });
  });

  it("returns empty lists with no DB call when managedTeamIds is empty", async () => {
    const scope = await buildScope(teamManagerUser([]));
    expect(scope.allowedTeamIds).toEqual([]);
    expect(scope.allowedPlayerIds).toEqual([]);
    expect(scope.allowedFamilyIds).toBe("all");
    expect(teamPlayerFindMany).not.toHaveBeenCalled();
  });

  it("queries TeamPlayer for managed teams and dedupes player IDs", async () => {
    teamPlayerFindMany.mockResolvedValue([
      { playerId: "p_1" },
      { playerId: "p_2" },
      { playerId: "p_1" }, // duplicate across teams — should be deduped
      { playerId: "p_3" },
    ]);

    const scope = await buildScope(teamManagerUser(["team_a", "team_b"]));

    expect(teamPlayerFindMany).toHaveBeenCalledWith({
      where: { teamId: { in: ["team_a", "team_b"] } },
      select: { playerId: true },
    });
    expect(scope.allowedTeamIds).toEqual(["team_a", "team_b"]);
    // Dedup order: Set preserves insertion, so p_1, p_2, p_3
    expect(scope.allowedPlayerIds).toEqual(["p_1", "p_2", "p_3"]);
  });
});

describe("buildScope — FAMILY", () => {
  it("throws Forbidden when clubId is missing", async () => {
    await expect(buildScope(familyUser(["p_1"], null))).rejects.toMatchObject({
      code: ErrorCodes.Forbidden,
    });
  });

  it("returns empty lists with no DB call when playerIds is empty", async () => {
    const scope = await buildScope(familyUser([]));
    expect(scope.allowedTeamIds).toEqual([]);
    expect(scope.allowedPlayerIds).toEqual([]);
    expect(scope.allowedFamilyIds).toEqual([]);
    expect(playerFindMany).not.toHaveBeenCalled();
  });

  it("queries Player, derives family IDs, and dedupes teams", async () => {
    // Two players on two overlapping teams, both with surname "Smith" and parent1 "Jane"
    // -> one derived family, two unique team IDs.
    playerFindMany.mockResolvedValue([
      {
        id: "p_1",
        surname: "Smith",
        firstName: "Alice",
        parent1: "Jane",
        teamPlayers: [{ teamId: "team_u10" }, { teamId: "team_u12" }],
      },
      {
        id: "p_2",
        surname: "Smith",
        firstName: "Bob",
        parent1: "Jane",
        teamPlayers: [{ teamId: "team_u10" }],
      },
    ]);

    const scope = await buildScope(familyUser(["p_1", "p_2"]));

    expect(playerFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["p_1", "p_2"] } },
      select: {
        id: true,
        surname: true,
        firstName: true,
        parent1: true,
        teamPlayers: { select: { teamId: true } },
      },
    });
    expect(scope.allowedPlayerIds).toEqual(["p_1", "p_2"]);
    // Team IDs deduped across both siblings
    expect(new Set(scope.allowedTeamIds as string[])).toEqual(
      new Set(["team_u10", "team_u12"])
    );
    // One family (same surname, same parent1) -> single derived family ID
    expect(scope.allowedFamilyIds).toEqual(["family_smith"]);
  });
});

/* ─── assertTeamAccess ──────────────────────────────────────────────────── */

function mkScope(partial: Partial<Scope>): Scope {
  return {
    userId: "u",
    role: "ADMIN",
    clubId: "club_a",
    allowedTeamIds: "all",
    allowedPlayerIds: "all",
    allowedFamilyIds: "all",
    ...partial,
  };
}

describe("assertTeamAccess", () => {
  it("SUPER_ADMIN (all) passes for any team", () => {
    const scope = mkScope({ role: "SUPER_ADMIN", clubId: null });
    expect(() => assertTeamAccess(scope, "any_team")).not.toThrow();
  });

  it("ADMIN with concrete list passes for in-list team", () => {
    const scope = mkScope({ allowedTeamIds: ["team_1", "team_2"] });
    expect(() => assertTeamAccess(scope, "team_1")).not.toThrow();
  });

  // REGRESSION: this catches the cross-club leak that was fixed in 7f7147c.
  // If ADMIN ever goes back to allowedTeamIds: "all", this test fails.
  it("ADMIN throws Forbidden for a team from another club (cross-club regression)", () => {
    const scope = mkScope({ allowedTeamIds: ["team_in_club_a"] });
    expect(() => assertTeamAccess(scope, "team_in_club_b")).toThrowError(McpError);
    try {
      assertTeamAccess(scope, "team_in_club_b");
    } catch (err) {
      expect((err as McpError).code).toBe(ErrorCodes.Forbidden);
    }
  });

  it("TEAM_MANAGER passes for a managed team", () => {
    const scope = mkScope({
      role: "TEAM_MANAGER",
      allowedTeamIds: ["team_u10"],
    });
    expect(() => assertTeamAccess(scope, "team_u10")).not.toThrow();
  });

  it("TEAM_MANAGER throws for an unmanaged team", () => {
    const scope = mkScope({
      role: "TEAM_MANAGER",
      allowedTeamIds: ["team_u10"],
    });
    expect(() => assertTeamAccess(scope, "team_u12")).toThrowError(McpError);
  });

  it("FAMILY passes for their own team", () => {
    const scope = mkScope({
      role: "FAMILY",
      allowedTeamIds: ["team_u10"],
    });
    expect(() => assertTeamAccess(scope, "team_u10")).not.toThrow();
  });

  it("FAMILY throws for someone else's team", () => {
    const scope = mkScope({
      role: "FAMILY",
      allowedTeamIds: ["team_u10"],
    });
    expect(() => assertTeamAccess(scope, "team_u12")).toThrowError(McpError);
  });
});

/* ─── assertPlayerAccess ────────────────────────────────────────────────── */

describe("assertPlayerAccess", () => {
  it("SUPER_ADMIN (all) passes for any player", () => {
    const scope = mkScope({ role: "SUPER_ADMIN", allowedPlayerIds: "all" });
    expect(() => assertPlayerAccess(scope, "p_any")).not.toThrow();
  });

  it("ADMIN with concrete list passes for in-list player", () => {
    const scope = mkScope({ allowedPlayerIds: ["p_1", "p_2"] });
    expect(() => assertPlayerAccess(scope, "p_1")).not.toThrow();
  });

  // REGRESSION: same class of bug for players.
  it("ADMIN throws Forbidden for a player from another club (cross-club regression)", () => {
    const scope = mkScope({ allowedPlayerIds: ["p_in_club_a"] });
    expect(() => assertPlayerAccess(scope, "p_in_club_b")).toThrowError(McpError);
  });

  it("FAMILY passes for their own player", () => {
    const scope = mkScope({
      role: "FAMILY",
      allowedPlayerIds: ["p_mine"],
    });
    expect(() => assertPlayerAccess(scope, "p_mine")).not.toThrow();
  });

  it("FAMILY throws for someone else's player", () => {
    const scope = mkScope({
      role: "FAMILY",
      allowedPlayerIds: ["p_mine"],
    });
    expect(() => assertPlayerAccess(scope, "p_other")).toThrowError(McpError);
  });
});

/* ─── assertFamilyAccess ────────────────────────────────────────────────── */

describe("assertFamilyAccess", () => {
  it('passes for roles with allowedFamilyIds: "all"', () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "TEAM_MANAGER"] as const) {
      const scope = mkScope({ role, allowedFamilyIds: "all" });
      expect(() => assertFamilyAccess(scope, "family_anything")).not.toThrow();
    }
  });

  it("FAMILY passes for their own derived family ID", () => {
    const scope = mkScope({
      role: "FAMILY",
      allowedFamilyIds: ["family_smith"],
    });
    expect(() => assertFamilyAccess(scope, "family_smith")).not.toThrow();
  });

  it("FAMILY throws for another family's ID", () => {
    const scope = mkScope({
      role: "FAMILY",
      allowedFamilyIds: ["family_smith"],
    });
    expect(() => assertFamilyAccess(scope, "family_jones")).toThrowError(McpError);
  });
});

/* ─── assertRole ────────────────────────────────────────────────────────── */

describe("assertRole", () => {
  it("passes when the user's role is in the allowed list", () => {
    const scope = mkScope({ role: "TEAM_MANAGER" });
    expect(() => assertRole(scope, ["ADMIN", "TEAM_MANAGER"])).not.toThrow();
  });

  it("throws Forbidden with a descriptive message when not in the allowed list", () => {
    const scope = mkScope({ role: "FAMILY" });
    expect(() => assertRole(scope, ["ADMIN", "SUPER_ADMIN"])).toThrowError(
      /FAMILY/
    );
    try {
      assertRole(scope, ["ADMIN"]);
    } catch (err) {
      expect((err as McpError).code).toBe(ErrorCodes.Forbidden);
    }
  });
});

/* ─── teamWhereClause ───────────────────────────────────────────────────── */

describe("teamWhereClause", () => {
  it("SUPER_ADMIN returns an empty where clause", () => {
    const scope = mkScope({
      role: "SUPER_ADMIN",
      clubId: null,
      allowedTeamIds: "all",
    });
    expect(teamWhereClause(scope)).toEqual({});
  });

  it("ADMIN returns both club filter and concrete team id filter", () => {
    const scope = mkScope({
      clubId: "club_a",
      allowedTeamIds: ["team_1", "team_2"],
    });
    expect(teamWhereClause(scope)).toEqual({
      season: { clubId: "club_a" },
      id: { in: ["team_1", "team_2"] },
    });
  });

  it("TEAM_MANAGER returns the same shape with managed team IDs", () => {
    const scope = mkScope({
      role: "TEAM_MANAGER",
      clubId: "club_a",
      allowedTeamIds: ["team_u10"],
    });
    expect(teamWhereClause(scope)).toEqual({
      season: { clubId: "club_a" },
      id: { in: ["team_u10"] },
    });
  });

  it("FAMILY with no allowed teams returns an empty IN filter", () => {
    const scope = mkScope({
      role: "FAMILY",
      clubId: "club_a",
      allowedTeamIds: [],
    });
    expect(teamWhereClause(scope)).toEqual({
      season: { clubId: "club_a" },
      id: { in: [] },
    });
  });
});
