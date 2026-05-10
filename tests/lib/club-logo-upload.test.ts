import { describe, test, expect } from "vitest";

import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/club-logo";
import { uploadClubLogo, deleteClubLogo } from "@/lib/club-logo-storage";

function fakeFile(name: string, type: string, sizeBytes: number): File {
  const buf = new ArrayBuffer(sizeBytes);
  return new File([buf], name, { type });
}

describe("uploadClubLogo", () => {
  test("accepts image/png and returns data URL", async () => {
    const file = fakeFile("logo.png", "image/png", 1000);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  test("accepts image/jpeg", async () => {
    const file = fakeFile("logo.jpg", "image/jpeg", 1000);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  test("accepts image/webp", async () => {
    const file = fakeFile("logo.webp", "image/webp", 1000);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url.startsWith("data:image/webp;base64,")).toBe(true);
  });

  test("accepts image/svg+xml", async () => {
    const file = fakeFile("logo.svg", "image/svg+xml", 500);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  test("rejects disallowed mime type", async () => {
    const file = fakeFile("logo.gif", "image/gif", 1000);
    await expect(uploadClubLogo("club-1", file)).rejects.toThrow(/mime type/i);
  });

  test("rejects application/pdf", async () => {
    const file = fakeFile("doc.pdf", "application/pdf", 1000);
    await expect(uploadClubLogo("club-1", file)).rejects.toThrow(/mime type/i);
  });

  test("rejects files over 2MB", async () => {
    const file = fakeFile("huge.png", "image/png", 2 * 1024 * 1024 + 1);
    await expect(uploadClubLogo("club-1", file)).rejects.toThrow(/2MB/i);
  });

  test("accepts file exactly at 2MB", async () => {
    const file = fakeFile("exact.png", "image/png", 2 * 1024 * 1024);
    const result = await uploadClubLogo("club-1", file);
    expect(result.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  test("base64 payload decodes back to original byte length", async () => {
    const file = fakeFile("logo.png", "image/png", 1234);
    const { url } = await uploadClubLogo("c1", file);
    const b64 = url.split(",", 2)[1];
    const decoded = Buffer.from(b64, "base64");
    expect(decoded.length).toBe(1234);
  });
});

describe("deleteClubLogo", () => {
  test("is a no-op and resolves", async () => {
    await expect(
      deleteClubLogo("data:image/png;base64,AAAA")
    ).resolves.toBeUndefined();
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
