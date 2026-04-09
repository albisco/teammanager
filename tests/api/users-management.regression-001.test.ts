import { describe, test, expect } from "vitest";
import { setTestSession, sessions } from "./setup";
import { createRequest } from "./request-helper";

// Regression: ISSUE-001 — ESLint no-unused-expressions blocked the build
// (ternary-as-statement in toggleTeam, fixed to if/else in users/page.tsx:169)
// Found by /qa on 2026-04-09
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-09.md

import { GET as getUsersManagement } from "@/app/api/users/management/route";
import { PUT as putUserById, DELETE as deleteUserById } from "@/app/api/users/[id]/route";

// ---------------------------------------------------------------------------
// GET /api/users/management — ADMIN/SUPER_ADMIN only
// ---------------------------------------------------------------------------
describe("GET /api/users/management roles", () => {
  test("ADMIN can access management data", async () => {
    setTestSession(sessions.admin);
    const res = await getUsersManagement();
    expect(res.status).not.toBe(403);
  });

  test("SUPER_ADMIN can access management data", async () => {
    setTestSession(sessions.superAdmin);
    const res = await getUsersManagement();
    expect(res.status).not.toBe(403);
  });

  test("TEAM_MANAGER cannot access management data", async () => {
    setTestSession(sessions.teamManager);
    const res = await getUsersManagement();
    expect(res.status).toBe(403);
  });

  test("FAMILY cannot access management data", async () => {
    setTestSession(sessions.family);
    const res = await getUsersManagement();
    expect(res.status).toBe(403);
  });

  test("unauthenticated cannot access management data", async () => {
    setTestSession(sessions.none);
    const res = await getUsersManagement();
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/[id] — ADMIN/SUPER_ADMIN only
// ---------------------------------------------------------------------------
describe("PUT /api/users/[id] roles", () => {
  const params = { params: { id: "some-user-id" } };

  test("ADMIN can update a user", async () => {
    setTestSession(sessions.admin);
    const res = await putUserById(
      createRequest("/api/users/some-user-id", { method: "PUT", body: { name: "New Name", email: "new@email.com" } }),
      params
    );
    expect(res.status).not.toBe(403);
  });

  test("SUPER_ADMIN can update a user", async () => {
    setTestSession(sessions.superAdmin);
    const res = await putUserById(
      createRequest("/api/users/some-user-id", { method: "PUT", body: { name: "New Name", email: "new@email.com" } }),
      params
    );
    expect(res.status).not.toBe(403);
  });

  test("TEAM_MANAGER cannot update a user", async () => {
    setTestSession(sessions.teamManager);
    const res = await putUserById(
      createRequest("/api/users/some-user-id", { method: "PUT", body: { name: "New Name", email: "new@email.com" } }),
      params
    );
    expect(res.status).toBe(403);
  });

  test("FAMILY cannot update a user", async () => {
    setTestSession(sessions.family);
    const res = await putUserById(
      createRequest("/api/users/some-user-id", { method: "PUT", body: { name: "New Name", email: "new@email.com" } }),
      params
    );
    expect(res.status).toBe(403);
  });

  test("unauthenticated cannot update a user", async () => {
    setTestSession(sessions.none);
    const res = await putUserById(
      createRequest("/api/users/some-user-id", { method: "PUT", body: { name: "New Name", email: "new@email.com" } }),
      params
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/[id] — ADMIN/SUPER_ADMIN only, cannot self-delete
// ---------------------------------------------------------------------------
describe("DELETE /api/users/[id] roles", () => {
  test("ADMIN can delete another user", async () => {
    setTestSession(sessions.admin);
    const params = { params: { id: "some-other-user-id" } };
    const res = await deleteUserById(
      createRequest("/api/users/some-other-user-id", { method: "DELETE" }),
      params
    );
    expect(res.status).not.toBe(403);
  });

  test("ADMIN cannot delete themselves (self-delete prevention)", async () => {
    setTestSession(sessions.admin);
    // sessions.admin.user.id === "qa-admin-id"
    const params = { params: { id: "qa-admin-id" } };
    const res = await deleteUserById(
      createRequest("/api/users/qa-admin-id", { method: "DELETE" }),
      params
    );
    expect(res.status).toBe(400);
  });

  test("TEAM_MANAGER cannot delete a user", async () => {
    setTestSession(sessions.teamManager);
    const params = { params: { id: "some-other-user-id" } };
    const res = await deleteUserById(
      createRequest("/api/users/some-other-user-id", { method: "DELETE" }),
      params
    );
    expect(res.status).toBe(403);
  });

  test("FAMILY cannot delete a user", async () => {
    setTestSession(sessions.family);
    const params = { params: { id: "some-other-user-id" } };
    const res = await deleteUserById(
      createRequest("/api/users/some-other-user-id", { method: "DELETE" }),
      params
    );
    expect(res.status).toBe(403);
  });

  test("unauthenticated cannot delete a user", async () => {
    setTestSession(sessions.none);
    const params = { params: { id: "some-other-user-id" } };
    const res = await deleteUserById(
      createRequest("/api/users/some-other-user-id", { method: "DELETE" }),
      params
    );
    expect(res.status).toBe(403);
  });
});
