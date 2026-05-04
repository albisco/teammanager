import { describe, test, expect } from "vitest";
import { getInitials, getColorFromName } from "@/lib/club-logo";

describe("getInitials", () => {
  test("extracts first letter of first two words", () => {
    expect(getInitials("Murrumbeena Football Club")).toBe("MF");
  });

  test("single word returns first two letters uppercased", () => {
    expect(getInitials("Murrumbeena")).toBe("MU");
  });

  test("two-word name returns both initials", () => {
    expect(getInitials("South Melbourne")).toBe("SM");
  });

  test("empty string returns fallback", () => {
    expect(getInitials("")).toBe("??");
  });

  test("whitespace-only returns fallback", () => {
    expect(getInitials("   ")).toBe("??");
  });

  test("single character returns that char doubled", () => {
    expect(getInitials("X")).toBe("X");
  });
});

describe("getColorFromName", () => {
  test("returns a valid hex color", () => {
    const color = getColorFromName("Murrumbeena Football Club");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("same name always returns same color", () => {
    const a = getColorFromName("South Melbourne");
    const b = getColorFromName("South Melbourne");
    expect(a).toBe(b);
  });

  test("different names return different colors", () => {
    const a = getColorFromName("Murrumbeena Football Club");
    const b = getColorFromName("South Melbourne");
    expect(a).not.toBe(b);
  });

  test("empty string returns a valid color", () => {
    const color = getColorFromName("");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
