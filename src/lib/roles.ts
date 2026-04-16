/**
 * Shared role string constants.
 *
 * The Prisma `Role` and `TeamStaffRole` enums are the source of truth, but
 * importing from `@prisma/client` isn't always safe (edge runtime middleware,
 * client components). Use these constants anywhere you'd otherwise write a
 * `"TEAM_MANAGER"` literal.
 *
 * On the server, prefer `import { Role, TeamStaffRole } from "@prisma/client"`
 * when the file doesn't need to run on the edge or in the browser.
 */

export const ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  TEAM_MANAGER: "TEAM_MANAGER",
  FAMILY: "FAMILY",
} as const;

export type RoleName = (typeof ROLE)[keyof typeof ROLE];

export const TEAM_STAFF_ROLE = {
  HEAD_COACH: "HEAD_COACH",
  TEAM_MANAGER: "TEAM_MANAGER",
  ASSISTANT_COACH: "ASSISTANT_COACH",
} as const;

export type TeamStaffRoleName = (typeof TEAM_STAFF_ROLE)[keyof typeof TEAM_STAFF_ROLE];

export function teamStaffRoleLabel(role: TeamStaffRoleName): string {
  switch (role) {
    case TEAM_STAFF_ROLE.HEAD_COACH:
      return "Head Coach";
    case TEAM_STAFF_ROLE.TEAM_MANAGER:
      return "Team Manager";
    case TEAM_STAFF_ROLE.ASSISTANT_COACH:
      return "Assistant Coach";
  }
}
