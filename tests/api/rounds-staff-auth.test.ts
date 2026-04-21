import { describe, test, expect, vi, beforeEach } from "vitest";
import { setTestSession, sessions } from "./setup";
import { createRequest } from "./request-helper";

// Mock the team-access chokepoint so we can flip the staff-role check on/off
// per test without rewiring the global prisma mock.
const hasStaffRoleMock = vi.fn();
vi.mock("@/lib/team-access", () => ({
  hasStaffRole: (...args: unknown[]) => hasStaffRoleMock(...args),
}));

import { POST as postRounds } from "@/app/api/rounds/route";
import { PUT as putRound, DELETE as deleteRound } from "@/app/api/rounds/[id]/route";

describe("Rounds API — TEAM_MANAGER scoped via TeamStaff", () => {
  beforeEach(() => {
    hasStaffRoleMock.mockReset();
  });

  test("TM with TeamStaff.TEAM_MANAGER on the team passes POST auth", async () => {
    setTestSession(sessions.teamManager);
    hasStaffRoleMock.mockResolvedValue(true);
    const res = await postRounds(
      createRequest("/api/rounds", { method: "POST", body: { teamId: "team-a", roundNumber: 1 } })
    );
    expect(res.status).not.toBe(403);
    expect(hasStaffRoleMock).toHaveBeenCalledWith(
      sessions.teamManager.user.id,
      "team-a",
      "TEAM_MANAGER"
    );
  });

  test("TM without staff row on the requested team is forbidden on POST", async () => {
    setTestSession(sessions.teamManager);
    hasStaffRoleMock.mockResolvedValue(false);
    const res = await postRounds(
      createRequest("/api/rounds", { method: "POST", body: { teamId: "team-other-club", roundNumber: 1 } })
    );
    expect(res.status).toBe(403);
  });

  test("TM PUT on a round whose team has no staff row is forbidden", async () => {
    setTestSession(sessions.teamManager);
    hasStaffRoleMock.mockResolvedValue(false);
    const res = await putRound(
      createRequest("/api/rounds/some-id", { method: "PUT", body: { opponent: "X" } }),
      { params: { id: "some-id" } }
    );
    // Either 403 (auth-rejected) or 404 (round mock returns null) — never 200.
    expect([403, 404]).toContain(res.status);
  });

  test("TM DELETE on a round whose team has no staff row is forbidden", async () => {
    setTestSession(sessions.teamManager);
    hasStaffRoleMock.mockResolvedValue(false);
    const res = await deleteRound(
      createRequest("/api/rounds/some-id", { method: "DELETE" }),
      { params: { id: "some-id" } }
    );
    expect([403, 404]).toContain(res.status);
  });

  test("ADMIN bypasses the TeamStaff check on POST", async () => {
    setTestSession(sessions.admin);
    // Even with the chokepoint set to deny, ADMIN should not be gated by it.
    hasStaffRoleMock.mockResolvedValue(false);
    const res = await postRounds(
      createRequest("/api/rounds", { method: "POST", body: { teamId: "team-a", roundNumber: 1 } })
    );
    expect(res.status).not.toBe(403);
    expect(hasStaffRoleMock).not.toHaveBeenCalled();
  });
});
