import { describe, test, expect } from "vitest";
import { setTestSession, sessions } from "./setup";
import { createRequest } from "./request-helper";

import { POST as postCustom, GET as getCustom } from "@/app/api/teams/[id]/duty-roles/custom/route";
import { PUT as putCustom, DELETE as deleteCustom } from "@/app/api/teams/[id]/duty-roles/custom/[roleId]/route";

const TEAM_ID = "qa-test-team-id";
const ROLE_ID = "qa-role-id";

// Note: prisma mock returns null for findUnique → canManageTeamDutyRoles returns
// 404 "Team not found" for the happy paths. We assert on auth behaviour only.

describe("team-scoped duty roles — auth", () => {
  test("unauthenticated cannot POST custom role", async () => {
    setTestSession(sessions.none);
    const res = await postCustom(
      createRequest(`/api/teams/${TEAM_ID}/duty-roles/custom`, { method: "POST", body: { roleName: "Boundary Umpire" } }),
      { params: { id: TEAM_ID } },
    );
    expect(res.status).toBe(401);
  });

  test("unauthenticated cannot GET custom roles", async () => {
    setTestSession(sessions.none);
    const res = await getCustom(
      createRequest(`/api/teams/${TEAM_ID}/duty-roles/custom`),
      { params: { id: TEAM_ID } },
    );
    expect(res.status).toBe(401);
  });

  test("FAMILY cannot POST custom role", async () => {
    setTestSession(sessions.family);
    const res = await postCustom(
      createRequest(`/api/teams/${TEAM_ID}/duty-roles/custom`, { method: "POST", body: { roleName: "Boundary Umpire" } }),
      { params: { id: TEAM_ID } },
    );
    expect([403, 404]).toContain(res.status);
  });

  test("TEAM_MANAGER on non-existent team gets 404", async () => {
    setTestSession(sessions.teamManager);
    const res = await postCustom(
      createRequest(`/api/teams/${TEAM_ID}/duty-roles/custom`, { method: "POST", body: { roleName: "Boundary Umpire" } }),
      { params: { id: TEAM_ID } },
    );
    expect(res.status).toBe(404);
  });

  test("unauthenticated cannot PUT / DELETE team role", async () => {
    setTestSession(sessions.none);
    const putRes = await putCustom(
      createRequest(`/api/teams/${TEAM_ID}/duty-roles/custom/${ROLE_ID}`, { method: "PUT", body: { roleName: "x" } }),
      { params: { id: TEAM_ID, roleId: ROLE_ID } },
    );
    expect(putRes.status).toBe(401);

    const delRes = await deleteCustom(
      createRequest(`/api/teams/${TEAM_ID}/duty-roles/custom/${ROLE_ID}`, { method: "DELETE" }),
      { params: { id: TEAM_ID, roleId: ROLE_ID } },
    );
    expect(delRes.status).toBe(401);
  });
});

// Toggle-gating (TEAM_MANAGER blocked when club.allowTeamDutyRoles=false) is
// covered via an integration test against the real DB — the shared prisma Proxy
// mock in setup.ts can't simulate the team + club + staff lookups needed to
// reach the toggle branch.
