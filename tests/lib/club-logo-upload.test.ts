import { describe, test, expect, vi, beforeEach } from "vitest";

const { mockPut, mockDel } = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockDel: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: mockPut,
  del: mockDel,
}));

import {
  uploadClubLogo,
  deleteClubLogo,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "@/lib/club-logo";

beforeEach(() => {
  mockPut.mockReset();
  mockDel.mockReset();
});

function fakeFile(
  name: string,
  type: string,
  sizeBytes: number
): File {
  const buf = new ArrayBuffer(sizeBytes);
  return new File([buf], name, { type });
}

describe("uploadClubLogo", () => {
  test("accepts image/png", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/clubs/c1/logo-abc.png" });
    const file = fakeFile("logo.png", "image/png", 1000);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url).toContain("blob.vercel-storage.com");
    expect(mockPut).toHaveBeenCalledOnce();
  });

  test("accepts image/jpeg", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/clubs/c1/logo-abc.jpg" });
    const file = fakeFile("logo.jpg", "image/jpeg", 1000);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url).toBeDefined();
  });

  test("accepts image/webp", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/clubs/c1/logo-abc.webp" });
    const file = fakeFile("logo.webp", "image/webp", 1000);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url).toBeDefined();
  });

  test("accepts image/svg+xml", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/clubs/c1/logo-abc.svg" });
    const file = fakeFile("logo.svg", "image/svg+xml", 500);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url).toBeDefined();
  });

  test("rejects disallowed mime type", async () => {
    const file = fakeFile("logo.gif", "image/gif", 1000);
    await expect(uploadClubLogo("club-1", file)).rejects.toThrow(/mime type/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test("rejects application/pdf", async () => {
    const file = fakeFile("doc.pdf", "application/pdf", 1000);
    await expect(uploadClubLogo("club-1", file)).rejects.toThrow(/mime type/i);
  });

  test("rejects files over 2MB", async () => {
    const file = fakeFile("huge.png", "image/png", 2 * 1024 * 1024 + 1);
    await expect(uploadClubLogo("club-1", file)).rejects.toThrow(/2MB/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test("accepts file exactly at 2MB", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/clubs/c1/logo-abc.png" });
    const file = fakeFile("exact.png", "image/png", 2 * 1024 * 1024);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url).toBeDefined();
  });

  test("blob path is namespaced by clubId", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/clubs/my-club/logo-abc.png" });
    const file = fakeFile("logo.png", "image/png", 1000);
    await uploadClubLogo("my-club", file);
    const callArgs = mockPut.mock.calls[0];
    expect(callArgs[0]).toMatch(/^clubs\/my-club\//);
  });

  test("blob put is called with addRandomSuffix true", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/clubs/c1/logo-abc.png" });
    const file = fakeFile("logo.png", "image/png", 1000);
    await uploadClubLogo("c1", file);
    const callArgs = mockPut.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ addRandomSuffix: true });
  });
});

describe("deleteClubLogo", () => {
  test("calls del with the provided URL", async () => {
    mockDel.mockResolvedValue(undefined);
    await deleteClubLogo("https://blob.vercel-storage.com/clubs/c1/logo-abc.png");
    expect(mockDel).toHaveBeenCalledWith("https://blob.vercel-storage.com/clubs/c1/logo-abc.png");
  });
});

describe("constants", () => {
  test("ALLOWED_MIME_TYPES includes the four required types", () => {
    expect(ALLOWED_MIME_TYPES).toContain("image/png");
    expect(ALLOWED_MIME_TYPES).toContain("image/jpeg");
    expect(ALLOWED_MIME_TYPES).toContain("image/webp");
    expect(ALLOWED_MIME_TYPES).toContain("image/svg+xml");
  });

  test("MAX_FILE_SIZE is 2MB", () => {
    expect(MAX_FILE_SIZE).toBe(2 * 1024 * 1024);
  });
});
