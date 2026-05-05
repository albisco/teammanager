import { describe, test, expect, vi, beforeEach } from "vitest";
import { setTestSession, sessions } from "./setup";

const mockUpdate = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      update: mockUpdate,
      findUnique: mockFindUnique,
    },
  },
}));

import { PATCH } from "@/app/api/clubs/[id]/route";
import { NextRequest } from "next/server";

const CLUB_ID = "qa-club-id";
const OTHER_CLUB_ID = "other-club-id";

function createPatchRequest(clubId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new URL(`/api/clubs/${clubId}`, "http://localhost:3000"),
    { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
  );
}

beforeEach(() => {
  mockUpdate.mockReset();
  mockFindUnique.mockReset();
});

describe("PATCH /api/clubs/[id] — auth", () => {
  test("unauthenticated returns 401", async () => {
    setTestSession(sessions.none);
    const req = createPatchRequest(CLUB_ID, { name: "New Name" });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(401);
  });

  test("FAMILY role returns 403", async () => {
    setTestSession(sessions.family);
    const req = createPatchRequest(CLUB_ID, { name: "New Name" });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("TEAM_MANAGER role returns 403", async () => {
    setTestSession(sessions.teamManager);
    const req = createPatchRequest(CLUB_ID, { name: "New Name" });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("ADMIN cannot update another club (403)", async () => {
    setTestSession(sessions.admin);
    const req = createPatchRequest(OTHER_CLUB_ID, { name: "New Name" });
    const res = await PATCH(req, { params: { id: OTHER_CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("SUPER_ADMIN can update any club", async () => {
    setTestSession(sessions.superAdmin);
    const updated = { id: OTHER_CLUB_ID, name: "Updated", slug: "updated" };
    mockUpdate.mockResolvedValueOnce(updated);
    const req = createPatchRequest(OTHER_CLUB_ID, { name: "Updated" });
    const res = await PATCH(req, { params: { id: OTHER_CLUB_ID } });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/clubs/[id] — ADMIN name-only restriction", () => {
  test("ADMIN can update name on own club", async () => {
    setTestSession(sessions.admin);
    const updated = { id: CLUB_ID, name: "New Club Name", slug: "old-slug" };
    mockUpdate.mockResolvedValueOnce(updated);
    const req = createPatchRequest(CLUB_ID, { name: "New Club Name" });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Club Name");
  });

  test("ADMIN cannot update slug (403)", async () => {
    setTestSession(sessions.admin);
    const req = createPatchRequest(CLUB_ID, { name: "New Name", slug: "new-slug" });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("ADMIN cannot update isAdultClub (403)", async () => {
    setTestSession(sessions.admin);
    const req = createPatchRequest(CLUB_ID, { isAdultClub: true });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("ADMIN cannot update enableAiChat (403)", async () => {
    setTestSession(sessions.admin);
    const req = createPatchRequest(CLUB_ID, { enableAiChat: true });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("empty name returns 400", async () => {
    setTestSession(sessions.admin);
    const req = createPatchRequest(CLUB_ID, { name: "" });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(400);
  });

  test("missing name returns 400", async () => {
    setTestSession(sessions.admin);
    const req = createPatchRequest(CLUB_ID, {});
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/clubs/[id] — SUPER_ADMIN full access", () => {
  test("SUPER_ADMIN can update name and slug together", async () => {
    setTestSession(sessions.superAdmin);
    const updated = { id: CLUB_ID, name: "Renamed", slug: "renamed" };
    mockUpdate.mockResolvedValueOnce(updated);
    const req = createPatchRequest(CLUB_ID, { name: "Renamed", slug: "renamed" });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("renamed");
  });
});

describe("PATCH /api/clubs/[id] — feature flags", () => {
  test("ADMIN can update enableRoster without name", async () => {
    setTestSession(sessions.admin);
    const updated = { id: CLUB_ID, name: "My Club", enableRoster: false, enableAwards: true };
    mockUpdate.mockResolvedValueOnce(updated);
    const req = createPatchRequest(CLUB_ID, { enableRoster: false });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(200);
  });

  test("ADMIN can update enableAwards without name", async () => {
    setTestSession(sessions.admin);
    const updated = { id: CLUB_ID, name: "My Club", enableRoster: true, enableAwards: false };
    mockUpdate.mockResolvedValueOnce(updated);
    const req = createPatchRequest(CLUB_ID, { enableAwards: false });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(200);
  });

  test("ADMIN can update name + feature flags together", async () => {
    setTestSession(sessions.admin);
    const updated = { id: CLUB_ID, name: "New Name", enableRoster: false, enableAwards: false };
    mockUpdate.mockResolvedValueOnce(updated);
    const req = createPatchRequest(CLUB_ID, { name: "New Name", enableRoster: false, enableAwards: false });
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(200);
  });

  test("ADMIN sending no updatable fields returns 400", async () => {
    setTestSession(sessions.admin);
    const req = createPatchRequest(CLUB_ID, {});
    const res = await PATCH(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(400);
  });
});
