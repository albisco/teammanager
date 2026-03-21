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
  test("TM can GET voting sessions", async () => {
    setTestSession(sessions.teamManager);
    const res = await getVoting(createRequest("/api/voting", { searchParams: { teamId: "qa-test-team-id" } }));
    expect(res.status).not.toBe(403);
  });

  test("TM can POST open voting", async () => {
    setTestSession(sessions.teamManager);
    const res = await postVoting(createRequest("/api/voting", { method: "POST", body: { roundId: "nonexistent" } }));
    expect(res.status).not.toBe(403);
  });

  test("TM can PUT toggle voting", async () => {
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
  test("TM can view results", async () => {
    setTestSession(sessions.teamManager);
    const res = await getVotingResults(createRequest("/api/voting/results", { searchParams: { teamId: "qa-test-team-id" } }));
    expect(res.status).not.toBe(403);
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
  test("TM cannot POST (create) rounds", async () => {
    setTestSession(sessions.teamManager);
    const res = await postRounds(createRequest("/api/rounds", { method: "POST", body: { teamId: "x", roundNumber: 1 } }));
    expect(res.status).toBe(403);
  });

  test("TM can PUT (edit) a round", async () => {
    setTestSession(sessions.teamManager);
    const params = { params: { id: "nonexistent" } };
    const res = await putRound(createRequest("/api/rounds/x", { method: "PUT", body: { opponent: "Test" } }), params);
    expect(res.status).not.toBe(403);
  });

  test("TM cannot DELETE a round", async () => {
    setTestSession(sessions.teamManager);
    const params = { params: { id: "nonexistent" } };
    const res = await deleteRound(createRequest("/api/rounds/x", { method: "DELETE" }), params);
    expect(res.status).toBe(403);
  });

  test("ADMIN can POST rounds", async () => {
    setTestSession(sessions.admin);
    const res = await postRounds(createRequest("/api/rounds", { method: "POST", body: { teamId: "x", roundNumber: 1 } }));
    expect(res.status).not.toBe(403);
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
  test("TM cannot create players", async () => {
    setTestSession(sessions.teamManager);
    const res = await postPlayers(createRequest("/api/players", { method: "POST", body: { firstName: "A", surname: "B", jumperNumber: 1 } }));
    expect(res.status).toBe(403);
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
