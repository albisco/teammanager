import { prisma } from "@/lib/prisma";
import { deriveFamilies } from "@/lib/roster-algorithm";
import { ErrorCodes, McpError, type AuthedUser, type Scope } from "./types";

/**
 * Build a Scope object from an authenticated user.
 *
 * Role rules (mirrors NextAuth role boundaries used elsewhere in the app):
 *
 * - SUPER_ADMIN  → no club filter, no team filter, no player filter
 * - ADMIN        → scoped to their clubId, all teams in that club, all players in that club
 * - TEAM_MANAGER → scoped to their clubId, only the teams they manage, only players on those teams
 * - FAMILY       → scoped to their clubId, only teams their players play for, only their players,
 *                  and only families derived from their own players' surnames
 *
 * The Scope returned here MUST be threaded into every Prisma query through the
 * helpers in this file (assertTeamAccess, assertPlayerAccess, etc).
 */
export async function buildScope(user: AuthedUser): Promise<Scope> {
  switch (user.role) {
    case "SUPER_ADMIN":
      return {
        userId: user.id,
        role: user.role,
        clubId: null,
        allowedTeamIds: "all",
        allowedPlayerIds: "all",
        allowedFamilyIds: "all",
      };

    case "ADMIN": {
      if (!user.clubId) {
        throw new McpError(ErrorCodes.Forbidden, "ADMIN user has no clubId");
      }
      return {
        userId: user.id,
        role: user.role,
        clubId: user.clubId,
        allowedTeamIds: "all",
        allowedPlayerIds: "all",
        allowedFamilyIds: "all",
      };
    }

    case "TEAM_MANAGER": {
      if (!user.clubId) {
        throw new McpError(ErrorCodes.Forbidden, "TEAM_MANAGER user has no clubId");
      }
      // TEAM_MANAGER can manage multiple teams (User.managedTeams is a relation).
      // Players accessible = union of TeamPlayer rows on those teams.
      const teamPlayers =
        user.managedTeamIds.length === 0
          ? []
          : await prisma.teamPlayer.findMany({
              where: { teamId: { in: user.managedTeamIds } },
              select: { playerId: true },
            });
      const playerIds = Array.from(new Set(teamPlayers.map((tp) => tp.playerId)));
      return {
        userId: user.id,
        role: user.role,
        clubId: user.clubId,
        allowedTeamIds: user.managedTeamIds,
        allowedPlayerIds: playerIds,
        allowedFamilyIds: "all",
      };
    }

    case "FAMILY": {
      if (!user.clubId) {
        throw new McpError(ErrorCodes.Forbidden, "FAMILY user has no clubId");
      }
      // FAMILY user sees: only their own players, only the teams those players play for,
      // and only the family-id derived from their own players' surnames.
      const myPlayers =
        user.playerIds.length === 0
          ? []
          : await prisma.player.findMany({
              where: { id: { in: user.playerIds } },
              select: { id: true, surname: true, firstName: true, parent1: true, teamPlayers: { select: { teamId: true } } },
            });
      const teamIds = Array.from(
        new Set(myPlayers.flatMap((p) => p.teamPlayers.map((tp) => tp.teamId)))
      );
      const familyIds = deriveFamilies(myPlayers).map((f) => f.id);
      return {
        userId: user.id,
        role: user.role,
        clubId: user.clubId,
        allowedTeamIds: teamIds,
        allowedPlayerIds: myPlayers.map((p) => p.id),
        allowedFamilyIds: familyIds,
      };
    }

    default:
      throw new McpError(ErrorCodes.Forbidden, `Unknown role: ${user.role}`);
  }
}

/* ─── Assertion helpers ─────────────────────────────────────────────────── */

export function assertTeamAccess(scope: Scope, teamId: string): void {
  if (scope.allowedTeamIds === "all") return;
  if (!scope.allowedTeamIds.includes(teamId)) {
    throw new McpError(
      ErrorCodes.Forbidden,
      `You don't have access to team ${teamId}`
    );
  }
}

export function assertPlayerAccess(scope: Scope, playerId: string): void {
  if (scope.allowedPlayerIds === "all") return;
  if (!scope.allowedPlayerIds.includes(playerId)) {
    throw new McpError(
      ErrorCodes.Forbidden,
      `You don't have access to player ${playerId}`
    );
  }
}

export function assertFamilyAccess(scope: Scope, familyId: string): void {
  if (scope.allowedFamilyIds === "all") return;
  if (!scope.allowedFamilyIds.includes(familyId)) {
    throw new McpError(
      ErrorCodes.Forbidden,
      `You don't have access to family ${familyId}`
    );
  }
}

export function assertRole(scope: Scope, allowed: Scope["role"][]): void {
  if (!allowed.includes(scope.role)) {
    throw new McpError(
      ErrorCodes.Forbidden,
      `This tool requires one of: ${allowed.join(", ")}. You have role: ${scope.role}.`
    );
  }
}

/**
 * Build a Prisma `where` clause fragment that filters teams to those the
 * scope can access. Use as: `{ ...teamWhere(scope), ...other }`.
 */
export function teamWhereClause(scope: Scope): { id?: { in: string[] }; season?: { clubId: string } } {
  const where: { id?: { in: string[] }; season?: { clubId: string } } = {};
  if (scope.clubId) where.season = { clubId: scope.clubId };
  if (scope.allowedTeamIds !== "all") where.id = { in: scope.allowedTeamIds };
  return where;
}
