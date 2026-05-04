import { describe, test, expect } from "vitest";
import { validateLogoFile } from "@/lib/logo-validation";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const buf = new ArrayBuffer(sizeBytes);
  return new File([buf], name, { type });
}

describe("validateLogoFile", () => {
  test("accepts PNG", () => {
    const result = validateLogoFile(makeFile("logo.png", "image/png", 1000));
    expect(result).toBeNull();
  });

  test("accepts JPEG", () => {
    const result = validateLogoFile(makeFile("logo.jpg", "image/jpeg", 1000));
    expect(result).toBeNull();
  });

  test("accepts WebP", () => {
    const result = validateLogoFile(makeFile("logo.webp", "image/webp", 1000));
    expect(result).toBeNull();
  });

  test("accepts SVG", () => {
    const result = validateLogoFile(makeFile("logo.svg", "image/svg+xml", 1000));
    expect(result).toBeNull();
  });

  test("rejects GIF", () => {
    const result = validateLogoFile(makeFile("logo.gif", "image/gif", 1000));
    expect(result).toMatch(/format/i);
  });

  test("rejects BMP", () => {
    const result = validateLogoFile(makeFile("logo.bmp", "image/bmp", 1000));
    expect(result).toMatch(/format/i);
  });

  test("rejects file over 2MB", () => {
    const result = validateLogoFile(makeFile("logo.png", "image/png", 3 * 1024 * 1024));
    expect(result).toMatch(/2MB/i);
  });

  test("accepts file exactly at 2MB", () => {
    const result = validateLogoFile(makeFile("logo.png", "image/png", 2 * 1024 * 1024));
    expect(result).toBeNull();
  });

  test("rejects file just over 2MB", () => {
    const result = validateLogoFile(makeFile("logo.png", "image/png", 2 * 1024 * 1024 + 1));
    expect(result).toMatch(/2MB/i);
  });
});
