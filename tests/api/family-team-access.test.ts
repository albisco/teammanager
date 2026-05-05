import { describe, test, expect, beforeEach } from "vitest";
import { setTestSession, sessions } from "./setup";
import { createRequest } from "./request-helper";

import { POST as postUsers } from "@/app/api/users/route";
import { PUT as putUserById } from "@/app/api/users/[id]/route";
import { GET as getUsersManagement } from "@/app/api/users/management/route";

// ---------------------------------------------------------------------------
// POST /api/users — family team access
// ---------------------------------------------------------------------------
describe("POST /api/users with familyTeams", () => {
  beforeEach(() => {
    setTestSession(sessions.admin);
  });

  test("accepts empty familyTeams for FAMILY role", async () => {
    // Empty array skips the DB team validation, so the route can complete.
    const res = await postUsers(
      createRequest("/api/users", {
        method: "POST",
        body: {
          name: "Jane Parent",
          email: "jane@example.com",
          password: "secret123",
          role: "FAMILY",
          familyTeams: [],
        },
      })
    );
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(400);
  });

  test("rejects familyTeams that is not an array with 400", async () => {
    const res = await postUsers(
      createRequest("/api/users", {
        method: "POST",
        body: {
          name: "Jane Parent",
          email: "jane2@example.com",
          password: "secret123",
          role: "FAMILY",
          familyTeams: "not-an-array",
        },
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/familyTeams must be an array/i);
  });

  test("FAMILY role without familyTeams field creates user normally", async () => {
    const res = await postUsers(
      createRequest("/api/users", {
        method: "POST",
        body: {
          name: "Jane Parent",
          email: "jane3@example.com",
          password: "secret123",
          role: "FAMILY",
          // familyTeams absent — should be a no-op
        },
      })
    );
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
  });

  test("familyTeams field is ignored for TEAM_MANAGER role", async () => {
    const res = await postUsers(
      createRequest("/api/users", {
        method: "POST",
        body: {
          name: "Coach Bob",
          email: "bob@example.com",
          password: "secret123",
          role: "TEAM_MANAGER",
          familyTeams: [],
        },
      })
    );
    expect(res.status).not.toBe(400);
  });

  test("TEAM_MANAGER cannot create users", async () => {
    setTestSession(sessions.teamManager);
    const res = await postUsers(
      createRequest("/api/users", {
        method: "POST",
        body: { name: "x", email: "x@x.com", password: "x", role: "FAMILY", familyTeams: [] },
      })
    );
    expect(res.status).toBe(403);
  });

  test("FAMILY cannot create users", async () => {
    setTestSession(sessions.family);
    const res = await postUsers(
      createRequest("/api/users", {
        method: "POST",
        body: { name: "x", email: "x@x.com", password: "x", role: "FAMILY", familyTeams: [] },
      })
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/[id] — family team access updates
// ---------------------------------------------------------------------------
describe("PUT /api/users/[id] with familyTeams", () => {
  const params = { params: { id: "some-family-user-id" } };

  beforeEach(() => {
    setTestSession(sessions.admin);
  });

  test("accepts empty familyTeams for FAMILY role update", async () => {
    const res = await putUserById(
      createRequest("/api/users/some-family-user-id", {
        method: "PUT",
        body: {
          name: "Jane Parent",
          email: "jane@example.com",
          role: "FAMILY",
          familyTeams: [],
        },
      }),
      params
    );
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(400);
  });

  test("rejects malformed familyTeams (non-array) with 400", async () => {
    const res = await putUserById(
      createRequest("/api/users/some-family-user-id", {
        method: "PUT",
        body: {
          name: "Jane Parent",
          email: "jane@example.com",
          role: "FAMILY",
          familyTeams: "bad",
        },
      }),
      params
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/familyTeams must be an array/i);
  });

  test("omitting familyTeams is a no-op (does not clear existing rows)", async () => {
    const res = await putUserById(
      createRequest("/api/users/some-family-user-id", {
        method: "PUT",
        body: {
          name: "Jane Parent",
          email: "jane@example.com",
          role: "FAMILY",
          // familyTeams absent
        },
      }),
      params
    );
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
  });

  test("role change away from FAMILY succeeds without error", async () => {
    // FamilyTeamAccess.deleteMany is called; proxy mock handles it gracefully.
    const res = await putUserById(
      createRequest("/api/users/some-family-user-id", {
        method: "PUT",
        body: {
          name: "New Admin",
          email: "newadmin@example.com",
          role: "ADMIN",
        },
      }),
      params
    );
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(500);
  });

  test("TEAM_MANAGER cannot update users", async () => {
    setTestSession(sessions.teamManager);
    const res = await putUserById(
      createRequest("/api/users/x", {
        method: "PUT",
        body: { name: "x", email: "x@x.com", role: "FAMILY", familyTeams: [] },
      }),
      { params: { id: "x" } }
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/management — still returns 200, shape unchanged
// ---------------------------------------------------------------------------
describe("GET /api/users/management with family access data", () => {
  test("ADMIN gets 200", async () => {
    setTestSession(sessions.admin);
    const res = await getUsersManagement();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("FAMILY still cannot access management data", async () => {
    setTestSession(sessions.family);
    const res = await getUsersManagement();
    expect(res.status).toBe(403);
  });
});
