import { describe, test, expect, vi, beforeEach } from "vitest";
import { setTestSession, sessions } from "./setup";

const { mockUploadClubLogo, mockDeleteClubLogo, mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockUploadClubLogo: vi.fn(),
  mockDeleteClubLogo: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/club-logo-storage", () => ({
  uploadClubLogo: mockUploadClubLogo,
  deleteClubLogo: mockDeleteClubLogo,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

import { POST, DELETE } from "@/app/api/clubs/[id]/logo/route";
import { NextRequest } from "next/server";

const CLUB_ID = "qa-club-id";
const OTHER_CLUB_ID = "other-club-id";

function createMultipartRequest(
  clubId: string,
  options?: { fileName?: string; fileType?: string; fileSizeBytes?: number; method?: string }
): NextRequest {
  const { fileName = "logo.png", fileType = "image/png", fileSizeBytes = 1000, method = "POST" } =
    options || {};

  const formData = new FormData();
  const buf = new ArrayBuffer(fileSizeBytes);
  const file = new File([buf], fileName, { type: fileType });
  formData.append("file", file);

  return new NextRequest(new URL(`/api/clubs/${clubId}/logo`, "http://localhost:3000"), {
    method,
    body: formData,
  });
}

function createDeleteRequest(clubId: string): NextRequest {
  return new NextRequest(new URL(`/api/clubs/${clubId}/logo`, "http://localhost:3000"), {
    method: "DELETE",
  });
}

beforeEach(() => {
  mockUploadClubLogo.mockReset();
  mockDeleteClubLogo.mockReset();
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
});

describe("POST /api/clubs/[id]/logo — auth", () => {
  test("unauthenticated returns 401", async () => {
    setTestSession(sessions.none);
    const req = createMultipartRequest(CLUB_ID);
    const res = await POST(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(401);
  });

  test("FAMILY role returns 403", async () => {
    setTestSession(sessions.family);
    const req = createMultipartRequest(CLUB_ID);
    const res = await POST(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("TEAM_MANAGER role returns 403", async () => {
    setTestSession(sessions.teamManager);
    const req = createMultipartRequest(CLUB_ID);
    const res = await POST(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("ADMIN cannot upload to another club (403)", async () => {
    setTestSession(sessions.admin);
    const req = createMultipartRequest(OTHER_CLUB_ID);
    const res = await POST(req, { params: { id: OTHER_CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("ADMIN can upload to own club", async () => {
    setTestSession(sessions.admin);
    mockUploadClubLogo.mockResolvedValue({ url: "https://blob.vercel-storage.com/logo.png" });
    const req = createMultipartRequest(CLUB_ID);
    const res = await POST(req, { params: { id: CLUB_ID } });
    // prisma mock returns null for findUnique → 404, but auth passes
    expect([200, 404]).toContain(res.status);
  });

  test("SUPER_ADMIN can upload to any club", async () => {
    setTestSession(sessions.superAdmin);
    mockUploadClubLogo.mockResolvedValue({ url: "https://blob.vercel-storage.com/logo.png" });
    const req = createMultipartRequest(OTHER_CLUB_ID);
    const res = await POST(req, { params: { id: OTHER_CLUB_ID } });
    // prisma mock returns null for findUnique → 404, but auth passes
    expect([200, 404]).toContain(res.status);
  });
});

describe("POST /api/clubs/[id]/logo — validation", () => {
  test("rejects oversized file (400)", async () => {
    setTestSession(sessions.superAdmin);
    const req = createMultipartRequest(CLUB_ID, { fileSizeBytes: 3 * 1024 * 1024 });
    const res = await POST(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/2MB/i);
  });

  test("rejects wrong mime type (400)", async () => {
    setTestSession(sessions.superAdmin);
    const req = createMultipartRequest(CLUB_ID, { fileName: "logo.gif", fileType: "image/gif" });
    const res = await POST(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/mime/i);
  });
});

describe("DELETE /api/clubs/[id]/logo — auth", () => {
  test("unauthenticated returns 401", async () => {
    setTestSession(sessions.none);
    const req = createDeleteRequest(CLUB_ID);
    const res = await DELETE(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(401);
  });

  test("FAMILY role returns 403", async () => {
    setTestSession(sessions.family);
    const req = createDeleteRequest(CLUB_ID);
    const res = await DELETE(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("ADMIN cannot delete logo from another club (403)", async () => {
    setTestSession(sessions.admin);
    const req = createDeleteRequest(OTHER_CLUB_ID);
    const res = await DELETE(req, { params: { id: OTHER_CLUB_ID } });
    expect(res.status).toBe(403);
  });

  test("ADMIN can delete logo from own club", async () => {
    setTestSession(sessions.admin);
    const req = createDeleteRequest(CLUB_ID);
    const res = await DELETE(req, { params: { id: CLUB_ID } });
    // prisma mock returns null for findUnique → 404, but auth passes
    expect([200, 404]).toContain(res.status);
  });

  test("SUPER_ADMIN can delete logo from any club", async () => {
    setTestSession(sessions.superAdmin);
    const req = createDeleteRequest(OTHER_CLUB_ID);
    const res = await DELETE(req, { params: { id: OTHER_CLUB_ID } });
    // prisma mock returns null for findUnique → 404, but auth passes
    expect([200, 404]).toContain(res.status);
  });
});

describe("POST /api/clubs/[id]/logo — happy path", () => {
  test("uploads new logo and returns URL", async () => {
    setTestSession(sessions.superAdmin);
    mockFindUnique.mockResolvedValueOnce({ id: CLUB_ID, name: "Test Club", logoUrl: null });
    mockUpdate.mockResolvedValueOnce({ id: CLUB_ID, name: "Test Club", logoUrl: "https://blob.vercel-storage.com/new-logo.png" });
    mockUploadClubLogo.mockResolvedValue({ url: "https://blob.vercel-storage.com/new-logo.png" });

    const req = createMultipartRequest(CLUB_ID);
    const res = await POST(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logoUrl).toBe("https://blob.vercel-storage.com/new-logo.png");
    expect(mockDeleteClubLogo).not.toHaveBeenCalled();
  });

  test("replaces existing logo and deletes old blob", async () => {
    setTestSession(sessions.superAdmin);
    const oldUrl = "https://blob.vercel-storage.com/old-logo.png";
    const newUrl = "https://blob.vercel-storage.com/new-logo.png";
    mockFindUnique.mockResolvedValueOnce({ id: CLUB_ID, name: "Test Club", logoUrl: oldUrl });
    mockUpdate.mockResolvedValueOnce({ id: CLUB_ID, name: "Test Club", logoUrl: newUrl });
    mockUploadClubLogo.mockResolvedValue({ url: newUrl });
    mockDeleteClubLogo.mockResolvedValue(undefined);

    const req = createMultipartRequest(CLUB_ID);
    const res = await POST(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(200);
    expect(mockDeleteClubLogo).toHaveBeenCalledWith(oldUrl);
  });
});

describe("DELETE /api/clubs/[id]/logo — happy path", () => {
  test("clears logoUrl and deletes blob", async () => {
    setTestSession(sessions.superAdmin);
    const existingUrl = "https://blob.vercel-storage.com/clubs/c1/logo.png";
    mockFindUnique.mockResolvedValueOnce({ id: CLUB_ID, name: "Test Club", logoUrl: existingUrl });
    mockUpdate.mockResolvedValueOnce({ id: CLUB_ID, name: "Test Club", logoUrl: null });
    mockDeleteClubLogo.mockResolvedValue(undefined);

    const req = createDeleteRequest(CLUB_ID);
    const res = await DELETE(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockDeleteClubLogo).toHaveBeenCalledWith(existingUrl);
  });

  test("returns 404 when club has no logo", async () => {
    setTestSession(sessions.superAdmin);
    mockFindUnique.mockResolvedValueOnce({ id: CLUB_ID, name: "Test Club", logoUrl: null });

    const req = createDeleteRequest(CLUB_ID);
    const res = await DELETE(req, { params: { id: CLUB_ID } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no logo/i);
  });
});
