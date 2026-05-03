import { describe, test, expect, beforeEach } from "vitest";
import { setTestSession, sessions } from "./setup";
import { createRequest } from "./request-helper";

import { GET as getFamilyTeams } from "@/app/api/family/teams/route";

// ---------------------------------------------------------------------------
// GET /api/family/teams — role gating
// ---------------------------------------------------------------------------
describe("GET /api/family/teams", () => {
  test("returns 401 when unauthenticated", async () => {
    setTestSession(null);
    const res = await getFamilyTeams();
    expect(res.status).toBe(401);
  });

  test("returns 403 for ADMIN role", async () => {
    setTestSession(sessions.admin);
    const res = await getFamilyTeams();
    expect(res.status).toBe(403);
  });

  test("returns 403 for TEAM_MANAGER role", async () => {
    setTestSession(sessions.teamManager);
    const res = await getFamilyTeams();
    expect(res.status).toBe(403);
  });

  test("returns 403 for SUPER_ADMIN role", async () => {
    setTestSession(sessions.superAdmin);
    const res = await getFamilyTeams();
    expect(res.status).toBe(403);
  });

  test("FAMILY user with clubId gets 200 and teams array", async () => {
    setTestSession(sessions.family);
    const res = await getFamilyTeams();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("teams");
    expect(Array.isArray(data.teams)).toBe(true);
  });

  test("FAMILY user with null clubId returns empty teams", async () => {
    setTestSession({
      user: {
        id: "fam-no-club",
        email: "noclub@example.com",
        name: "No Club",
        role: "FAMILY",
        clubId: null,
      },
    });
    const res = await getFamilyTeams();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.teams).toEqual([]);
  });
});
