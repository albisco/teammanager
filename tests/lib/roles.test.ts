import { describe, test, expect } from "vitest";
import { matchTeamStaffRole, TEAM_STAFF_ROLE } from "@/lib/roles";

describe("matchTeamStaffRole", () => {
  test("matches canonical names", () => {
    expect(matchTeamStaffRole("Head Coach")).toBe(TEAM_STAFF_ROLE.HEAD_COACH);
    expect(matchTeamStaffRole("Team Manager")).toBe(TEAM_STAFF_ROLE.TEAM_MANAGER);
    expect(matchTeamStaffRole("Assistant Coach")).toBe(TEAM_STAFF_ROLE.ASSISTANT_COACH);
  });

  test("case-insensitive + trim", () => {
    expect(matchTeamStaffRole("  head coach  ")).toBe(TEAM_STAFF_ROLE.HEAD_COACH);
    expect(matchTeamStaffRole("TEAM MANAGER")).toBe(TEAM_STAFF_ROLE.TEAM_MANAGER);
  });

  test("aliases match", () => {
    expect(matchTeamStaffRole("Assistant Coaches")).toBe(TEAM_STAFF_ROLE.ASSISTANT_COACH);
    expect(matchTeamStaffRole("Coach")).toBe(TEAM_STAFF_ROLE.HEAD_COACH);
    expect(matchTeamStaffRole("Manager")).toBe(TEAM_STAFF_ROLE.TEAM_MANAGER);
    expect(matchTeamStaffRole("Asst Coach")).toBe(TEAM_STAFF_ROLE.ASSISTANT_COACH);
  });

  test("unrelated role returns null", () => {
    expect(matchTeamStaffRole("Canteen")).toBeNull();
    expect(matchTeamStaffRole("Goal Umpire")).toBeNull();
    expect(matchTeamStaffRole("")).toBeNull();
  });
});
