import { TeamStaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Returns true if the user holds the given staff role on the team.
 *
 * This is the single chokepoint for "can this user act as a TEAM_MANAGER on
 * this team?" — voting admin, round-scoped actions, etc. all route through
 * here. If we ever add per-club configuration for which staff roles may
 * administer voting (see plan Follow-ups), swap the callsites for a
 * `canAdminVoting(userId, teamId)` variant that reads club config.
 */
export async function hasStaffRole(
  userId: string,
  teamId: string,
  role: TeamStaffRole
): Promise<boolean> {
  const row = await prisma.teamStaff.findFirst({
    where: { userId, teamId, role },
    select: { id: true },
  });
  return !!row;
}

/**
 * Returns the full list of staff roles a user holds on a given team (a user
 * could legitimately be HEAD_COACH + TEAM_MANAGER on the same team, though
 * the UI treats those as single-slot).
 */
export async function getStaffRoles(
  userId: string,
  teamId: string
): Promise<TeamStaffRole[]> {
  const rows = await prisma.teamStaff.findMany({
    where: { userId, teamId },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}

/**
 * Returns all (teamId, role) pairs a user has staff assignments for. Used by
 * auth to populate the JWT `teams` array.
 */
export async function getUserTeamStaff(
  userId: string
): Promise<Array<{ teamId: string; role: TeamStaffRole }>> {
  return prisma.teamStaff.findMany({
    where: { userId },
    select: { teamId: true, role: true },
  });
}
