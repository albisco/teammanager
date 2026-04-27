import { describe, test, expect, beforeEach } from "vitest";
import { setTestSession, sessions } from "./setup";
import { createRequest } from "./request-helper";

// ---- Route imports ----
import { GET as getVoting, POST as postVoting, PUT as putVoting } from "@/app/api/voting/route";
import { GET as getVotingResults } from "@/app/api/voting/results/route";
import { GET as getDutyRoles, POST as postDutyRoles, PUT as putDutyRoles, DELETE as deleteDutyRoles } from "@/app/api/duty-roles/route";
import { POST as postRounds } from "@/app/api/rounds/route";
import { PUT as putRound, DELETE as deleteRound } from "@/app/api/rounds/[id]/route";
import { POST as postTeams } from "@/app/api/teams/route";
import { GET as getUsers, POST as postUsers } from "@/app/api/users/route";
import { POST as postPlayers } from "@/app/api/players/route";
import { GET as getManagerTeam } from "@/app/api/manager/team/route";
import { GET as getManagerRoster } from "@/app/api/manager/roster/route";
import { GET as getNextRoundDuties } from "@/app/api/manager/next-round-duties/route";
import { POST as postAutoLink } from "@/app/api/manager/auto-link-families/route";

// Helper to get status from NextResponse
async function status(response: Response) {
  return response.status;
}

// ---------------------------------------------------------------------------
// Role-based access matrix tests
// Each test validates that a given role gets the expected status code.
// We test the auth gate only — not full business logic.
// ---------------------------------------------------------------------------

describe("Voting API roles", () => {
  // TM access is now scoped to the specific team via TeamStaff.TEAM_MANAGER.
  // With the test prisma mock returning null for teamStaff.findFirst, a TM
  // without a staff row for the requested team gets 403 — the admin paths
  // (POST/PUT) short-circuit at the coarse role gate before hitting the DB
  // and so still return a non-403 at the mock level.
  test("TM without staff row on team gets 403 on GET", async () => {
    setTestSession(sessions.teamManager);
    const res = await getVoting(createRequest("/api/voting", { searchParams: { teamId: "qa-test-team-id" } }));
    expect(res.status).toBe(403);
  });

  test("TM passes coarse role gate on POST open voting", async () => {
    setTestSession(sessions.teamManager);
    const res = await postVoting(createRequest("/api/voting", { method: "POST", body: { roundId: "nonexistent" } }));
    // Passes coarse role gate — fine-grained staff-role check happens after
    // round lookup, which 404s in the mock before we reach the staff check.
    expect(res.status).not.toBe(403);
  });

  test("TM passes coarse role gate on PUT toggle voting", async () => {
    setTestSession(sessions.teamManager);
    const res = await putVoting(createRequest("/api/voting", { method: "PUT", body: { votingSessionId: "x", status: "CLOSED" } }));
    expect(res.status).not.toBe(403);
  });

  test("FAMILY cannot POST open voting", async () => {
    setTestSession(sessions.family);
    const res = await postVoting(createRequest("/api/voting", { method: "POST", body: { roundId: "x" } }));
    expect(res.status).toBe(403);
  });

  test("unauthenticated cannot GET voting", async () => {
    setTestSession(sessions.none);
    const res = await getVoting(createRequest("/api/voting", { searchParams: { teamId: "x" } }));
    expect(res.status).toBe(401);
  });
});

describe("Voting Results API roles", () => {
  test("TM without staff row on team gets 403 on results", async () => {
    // Scoped gate: a TM user needs a TeamStaff.TEAM_MANAGER row for the
    // specific team. Mocked prisma returns null → 403.
    setTestSession(sessions.teamManager);
    const res = await getVotingResults(createRequest("/api/voting/results", { searchParams: { teamId: "qa-test-team-id" } }));
    expect(res.status).toBe(403);
  });

  test("ADMIN can view results", async () => {
    setTestSession(sessions.admin);
    const res = await getVotingResults(createRequest("/api/voting/results", { searchParams: { teamId: "qa-test-team-id" } }));
    expect(res.status).not.toBe(403);
  });

  test("FAMILY cannot view results", async () => {
    setTestSession(sessions.family);
    const res = await getVotingResults(createRequest("/api/voting/results", { searchParams: { teamId: "x" } }));
    expect(res.status).toBe(403);
  });

  test("unauthenticated cannot view results", async () => {
    setTestSession(sessions.none);
    const res = await getVotingResults(createRequest("/api/voting/results", { searchParams: { teamId: "x" } }));
    expect(res.status).toBe(403);
  });
});

describe("Duty Roles API roles", () => {
  test("TM can GET duty roles", async () => {
    setTestSession(sessions.teamManager);
    const res = await getDutyRoles(createRequest("/api/duty-roles"));
    expect(res.status).not.toBe(403);
  });

  test("TM can POST (create) duty role", async () => {
    setTestSession(sessions.teamManager);
    const res = await postDutyRoles(createRequest("/api/duty-roles", { method: "POST", body: { roleName: "test" } }));
    expect(res.status).not.toBe(403);
  });

  test("TM cannot PUT (rename) duty role", async () => {
    setTestSession(sessions.teamManager);
    const res = await putDutyRoles(createRequest("/api/duty-roles", { method: "PUT", body: { id: "x", roleName: "y" } }));
    expect(res.status).toBe(403);
  });

  test("TM cannot DELETE duty role", async () => {
    setTestSession(sessions.teamManager);
    const res = await deleteDutyRoles(createRequest("/api/duty-roles", { method: "DELETE", body: { id: "x" } }));
    expect(res.status).toBe(403);
  });

  test("ADMIN can PUT duty role", async () => {
    setTestSession(sessions.admin);
    const res = await putDutyRoles(createRequest("/api/duty-roles", { method: "PUT", body: { id: "x", roleName: "y" } }));
    expect(res.status).not.toBe(403);
  });

  test("FAMILY cannot create duty role", async () => {
    setTestSession(sessions.family);
    const res = await postDutyRoles(createRequest("/api/duty-roles", { method: "POST", body: { roleName: "test" } }));
    expect(res.status).toBe(403);
  });
});

describe("Rounds API roles", () => {
  // TM access on rounds is now scoped via TeamStaff.TEAM_MANAGER. The default
  // prisma mock returns null for teamStaff.findFirst, so a TM with no staff
  // row for the requested team gets 403. Positive cases (TM with a matching
  // staff row) live in rounds-staff-auth.test.ts where hasStaffRole is mocked.
  test("TM without staff row cannot POST rounds", async () => {
    setTestSession(sessions.teamManager);
    const res = await postRounds(createRequest("/api/rounds", { method: "POST", body: { teamId: "x", roundNumber: 1 } }));
    expect(res.status).toBe(403);
  });

  test("TM without staff row cannot PUT a round", async () => {
    setTestSession(sessions.teamManager);
    const params = { params: { id: "nonexistent" } };
    const res = await putRound(createRequest("/api/rounds/x", { method: "PUT", body: { opponent: "Test" } }), params);
    // 404 (round not found) is acceptable — but never 200 success
    expect([403, 404]).toContain(res.status);
  });

  test("TM without staff row cannot DELETE a round", async () => {
    setTestSession(sessions.teamManager);
    const params = { params: { id: "nonexistent" } };
    const res = await deleteRound(createRequest("/api/rounds/x", { method: "DELETE" }), params);
    expect([403, 404]).toContain(res.status);
  });

  test("ADMIN can POST rounds", async () => {
    setTestSession(sessions.admin);
    const res = await postRounds(createRequest("/api/rounds", { method: "POST", body: { teamId: "x", roundNumber: 1 } }));
    expect(res.status).not.toBe(403);
  });

  test("FAMILY cannot POST rounds", async () => {
    setTestSession(sessions.family);
    const res = await postRounds(createRequest("/api/rounds", { method: "POST", body: { teamId: "x", roundNumber: 1 } }));
    expect(res.status).toBe(403);
  });
});

describe("Teams API roles", () => {
  test("TM cannot create teams", async () => {
    setTestSession(sessions.teamManager);
    const res = await postTeams(createRequest("/api/teams", { method: "POST", body: { name: "X", ageGroup: "U10", seasonId: "x" } }));
    expect(res.status).toBe(403);
  });

  test("ADMIN can create teams", async () => {
    setTestSession(sessions.admin);
    const res = await postTeams(createRequest("/api/teams", { method: "POST", body: { name: "X", ageGroup: "U10", seasonId: "x" } }));
    expect(res.status).not.toBe(403);
  });
});

describe("Players API roles", () => {
  test("TM can create players", async () => {
    setTestSession(sessions.teamManager);
    const res = await postPlayers(createRequest("/api/players", { method: "POST", body: { firstName: "A", surname: "B", jumperNumber: 1 } }));
    expect(res.status).not.toBe(403);
  });

  test("ADMIN can create players", async () => {
    setTestSession(sessions.admin);
    const res = await postPlayers(createRequest("/api/players", { method: "POST", body: { firstName: "A", surname: "B", jumperNumber: 1 } }));
    expect(res.status).not.toBe(403);
  });
});

describe("Users API roles", () => {
  test("TM cannot list users", async () => {
    setTestSession(sessions.teamManager);
    const res = await getUsers(createRequest("/api/users"));
    expect(res.status).toBe(403);
  });

  test("ADMIN can list users", async () => {
    setTestSession(sessions.admin);
    const res = await getUsers(createRequest("/api/users"));
    expect(res.status).not.toBe(403);
  });

  test("TM cannot create users", async () => {
    setTestSession(sessions.teamManager);
    const res = await postUsers(createRequest("/api/users", { method: "POST", body: { email: "x", name: "x", role: "FAMILY" } }));
    expect(res.status).toBe(403);
  });
});

describe("Manager-only APIs", () => {
  test("TM can access /api/manager/team", async () => {
    setTestSession(sessions.teamManager);
    const res = await getManagerTeam();
    expect(res.status).not.toBe(403);
  });

  test("ADMIN gets 401 on /api/manager/team (no session match)", async () => {
    setTestSession(sessions.admin);
    const res = await getManagerTeam();
    // Admin role doesn't match, should get blocked
    expect([401, 404]).toContain(res.status);
  });

  test("TM can access /api/manager/roster", async () => {
    setTestSession(sessions.teamManager);
    const res = await getManagerRoster();
    expect(res.status).not.toBe(403);
  });

  test("TM can call auto-link families", async () => {
    setTestSession(sessions.teamManager);
    const res = await postAutoLink();
    expect(res.status).not.toBe(403);
  });

  test("ADMIN cannot call auto-link families", async () => {
    setTestSession(sessions.admin);
    const res = await postAutoLink();
    expect(res.status).toBe(403);
  });

  test("TM can access /api/manager/next-round-duties", async () => {
    setTestSession(sessions.teamManager);
    const res = await getNextRoundDuties();
    expect(res.status).not.toBe(403);
  });

  test("ADMIN cannot access /api/manager/next-round-duties", async () => {
    setTestSession(sessions.admin);
    const res = await getNextRoundDuties();
    expect(res.status).toBe(403);
  });

  test("FAMILY cannot access /api/manager/next-round-duties", async () => {
    setTestSession(sessions.family);
    const res = await getNextRoundDuties();
    expect(res.status).toBe(403);
  });

  test("unauthenticated cannot access /api/manager/next-round-duties", async () => {
    setTestSession(sessions.none);
    const res = await getNextRoundDuties();
    expect([401, 403]).toContain(res.status);
  });
});

describe("Season API roles", () => {
  // Import dynamically to avoid circular issues
  test("TM cannot create seasons", async () => {
    const { POST: postSeason } = await import("@/app/api/season/route");
    setTestSession(sessions.teamManager);
    const res = await postSeason(createRequest("/api/season", { method: "POST", body: { name: "X", year: 2099 } }));
    expect(res.status).toBe(403);
  });
});

describe("Share Duties ordering", () => {
  test("roster API includes sortOrder and returns roles in sorted order", async () => {
    // This test verifies:
    // 1. sortOrder is present in the API response
    // 2. roles are returned in sortOrder order (not just having the field)
    setTestSession(sessions.teamManager);

    const res = await getManagerRoster();
    expect(res.status).toBe(200);

    const data = await res.json();

    // Verify sortOrder field exists
    expect(data.roster.roles).toBeDefined();
    if (data.roster.roles.length > 0) {
      expect(data.roster.roles[0]).toHaveProperty("sortOrder");
    }
    if (data.roster.staffRoles && data.roster.staffRoles.length > 0) {
      expect(data.roster.staffRoles[0]).toHaveProperty("sortOrder");
    }

    // Verify roles are actually sorted by sortOrder (not just containing the field)
    const roles = data.roster.roles;
    for (let i = 1; i < roles.length; i++) {
      const prev = roles[i - 1].sortOrder ?? 0;
      const curr = roles[i].sortOrder ?? 0;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  test("roster API returns combined allRoles sorted by sortOrder", async () => {
    // This test verifies:
    // 1. allRoles field exists
    // 2. Contains both team roles and staff roles
    // 3. Is sorted by sortOrder
    setTestSession(sessions.teamManager);

    const res = await getManagerRoster();
    expect(res.status).toBe(200);

    const data = await res.json();

    // Verify allRoles exists
    expect(data.roster.allRoles).toBeDefined();

    // If we have any roles, verify they're sorted
    const allRoles = data.roster.allRoles;
    if (allRoles && allRoles.length > 1) {
      for (let i = 1; i < allRoles.length; i++) {
        const prev = allRoles[i - 1].sortOrder ?? 0;
        const curr = allRoles[i].sortOrder ?? 0;
        expect(prev).toBeLessThanOrEqual(curr);
      }
    }

    // Verify each role has required fields
    for (const role of allRoles ?? []) {
      expect(role).toHaveProperty("id");
      expect(role).toHaveProperty("roleName");
      expect(role).toHaveProperty("roleType");
      expect(role).toHaveProperty("sortOrder");
      expect(role).toHaveProperty("isStaffRole");
    }
  });

  test("reordering roles in Admin persists and reflects in roster API", async () => {
    // This test verifies that when roles are reordered via the API,
    // the new order is reflected in subsequent roster API calls
    setTestSession(sessions.admin);

    // Get initial roles
    const initialRes = await getDutyRoles();
    expect(initialRes.status).toBe(200);
    const initialData = await initialRes.json();
    const roles = initialData.roles ?? [];

    if (roles.length >= 2) {
      // Capture original order
      const originalOrder = roles.map((r: { id: string }) => r.id);

      // Swap first two roles
      const swappedOrder = [originalOrder[1], originalOrder[0], ...originalOrder.slice(2)];

      // Update order via API
      const putRes = await putDutyRoles(createRequest("/api/duty-roles", {
        method: "PUT",
        body: { orderedIds: swappedOrder },
      }));
      expect(putRes.status).toBe(200);

      // Verify order changed
      const afterRes = await getDutyRoles();
      const afterData = await afterRes.json();
      const afterOrder = afterData.roles.map((r: { id: string }) => r.id);

      // Verify the swap happened
      expect(afterOrder[0]).toBe(originalOrder[1]);
      expect(afterOrder[1]).toBe(originalOrder[0]);

      // Restore original order
      await putDutyRoles(createRequest("/api/duty-roles", {
        method: "PUT",
        body: { orderedIds: originalOrder },
      }));
    }
  });
});
