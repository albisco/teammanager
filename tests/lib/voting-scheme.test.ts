import { describe, test, expect } from "vitest";
import { parseVotingScheme } from "@/lib/voting-scheme";

describe("parseVotingScheme", () => {
  test("valid descending scheme parses to number array", () => {
    const result = parseVotingScheme("5,4,3,2,1");
    expect(result).toEqual({ ok: true, value: [5, 4, 3, 2, 1] });
  });

  test("trims internal whitespace", () => {
    const result = parseVotingScheme("5, 4 , 3");
    expect(result).toEqual({ ok: true, value: [5, 4, 3] });
  });

  test("single-element scheme is valid", () => {
    const result = parseVotingScheme("3");
    expect(result).toEqual({ ok: true, value: [3] });
  });

  test("ascending input is rejected", () => {
    const result = parseVotingScheme("1,2,3");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/descending/i);
  });

  test("duplicates are rejected", () => {
    // Strictly descending check catches this, but message should mention descending or duplicate
    const result = parseVotingScheme("5,4,4,2,1");
    expect(result.ok).toBe(false);
  });

  test("non-integer tokens are rejected", () => {
    const result = parseVotingScheme("5,4,foo,2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/foo/);
  });

  test("decimal tokens are rejected", () => {
    const result = parseVotingScheme("5,4.5,3");
    expect(result.ok).toBe(false);
  });

  test("empty string is rejected", () => {
    const result = parseVotingScheme("");
    expect(result.ok).toBe(false);
  });

  test("whitespace-only string is rejected", () => {
    const result = parseVotingScheme("   ");
    expect(result.ok).toBe(false);
  });

  test("trailing comma is rejected", () => {
    const result = parseVotingScheme("5,4,3,");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/comma/i);
  });

  test("leading comma is rejected", () => {
    const result = parseVotingScheme(",5,4,3");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/comma/i);
  });

  test("length over 10 is rejected", () => {
    const result = parseVotingScheme("20,19,18,17,16,15,14,13,12,11,10");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/10/);
  });

  test("length exactly 10 is valid", () => {
    const result = parseVotingScheme("10,9,8,7,6,5,4,3,2,1");
    expect(result).toEqual({ ok: true, value: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] });
  });

  test("length under maxVotesPerRound is rejected", () => {
    const result = parseVotingScheme("5,4,3", 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/5/);
  });

  test("length equal to maxVotesPerRound is valid", () => {
    const result = parseVotingScheme("5,4,3", 3);
    expect(result).toEqual({ ok: true, value: [5, 4, 3] });
  });

  test("length greater than maxVotesPerRound is valid", () => {
    const result = parseVotingScheme("5,4,3,2,1", 3);
    expect(result).toEqual({ ok: true, value: [5, 4, 3, 2, 1] });
  });

  test("no maxVotesPerRound — single element valid", () => {
    const result = parseVotingScheme("7");
    expect(result).toEqual({ ok: true, value: [7] });
  });
});
