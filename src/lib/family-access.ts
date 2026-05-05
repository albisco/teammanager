import { prisma } from "@/lib/prisma";

/**
 * Returns the union of team IDs accessible to a family user:
 *   1. Teams reachable via Player.familyId → TeamPlayer
 *   2. Teams manually granted via FamilyTeamAccess
 * Both sources are scoped to the given clubId.
 */
export async function getFamilyAccessibleTeams(
  familyUserId: string,
  clubId: string
): Promise<string[]> {
  const [playerRows, manualRows] = await Promise.all([
    prisma.teamPlayer.findMany({
      where: { player: { familyId: familyUserId, clubId } },
      select: { teamId: true },
    }),
    prisma.familyTeamAccess.findMany({
      where: { familyUserId, clubId },
      select: { teamId: true },
    }),
  ]);

  const seen = new Set<string>();
  for (const r of playerRows) seen.add(r.teamId);
  for (const r of manualRows) seen.add(r.teamId);
  return Array.from(seen);
}

/**
 * Returns true when a family user is allowed to access a specific team.
 * Checks both player-derived access and manual grants, scoped to clubId.
 */
export async function canFamilyAccessTeam(
  familyUserId: string,
  teamId: string,
  clubId: string
): Promise<boolean> {
  const [manual, player] = await Promise.all([
    prisma.familyTeamAccess.findUnique({
      where: { familyUserId_teamId: { familyUserId, teamId } },
      select: { clubId: true },
    }),
    prisma.teamPlayer.findFirst({
      where: { teamId, player: { familyId: familyUserId, clubId } },
      select: { id: true },
    }),
  ]);

  if (manual && manual.clubId === clubId) return true;
  return player !== null;
}
