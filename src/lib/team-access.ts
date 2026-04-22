import { Role, TeamStaffRole } from "@prisma/client";
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
/**
 * Can this user create/edit/delete team-scoped DutyRole rows for `teamId`?
 *
 * - SUPER_ADMIN: always.
 * - ADMIN of the club that owns the team: always (admin override — not gated by
 *   club.allowTeamDutyRoles, since admins can always manage their club's data).
 * - TEAM_MANAGER of the team: only if `club.allowTeamDutyRoles === true`.
 */
export async function canManageTeamDutyRoles(
  user: { id: string; role: Role; clubId?: string | null },
  teamId: string
): Promise<{ ok: true; clubId: string } | { ok: false; status: number; error: string }> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { season: { select: { clubId: true } } },
  });
  if (!team) return { ok: false, status: 404, error: "Team not found" };
  const clubId = team.season.clubId;

  if (user.role === Role.SUPER_ADMIN) return { ok: true, clubId };
  if (user.role === Role.ADMIN && user.clubId === clubId) return { ok: true, clubId };

  if (user.role === Role.TEAM_MANAGER) {
    const [club, staff] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId }, select: { allowTeamDutyRoles: true } }),
      prisma.teamStaff.findFirst({
        where: { userId: user.id, teamId, role: TeamStaffRole.TEAM_MANAGER },
        select: { id: true },
      }),
    ]);
    if (!staff) return { ok: false, status: 403, error: "Forbidden" };
    if (!club?.allowTeamDutyRoles) {
      return { ok: false, status: 403, error: "Club has not enabled team-managed duty roles" };
    }
    return { ok: true, clubId };
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

export async function getUserTeamStaff(
  userId: string
): Promise<Array<{ teamId: string; role: TeamStaffRole }>> {
  return prisma.teamStaff.findMany({
    where: { userId },
    select: { teamId: true, role: true },
  });
}
