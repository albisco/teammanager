import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveFamiliesWithPlayers } from "@/lib/roster-algorithm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "FAMILY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const teamIds = ((session.user as unknown as { familyTeams?: string[] })?.familyTeams ?? []) as string[];

  if (teamIds.length === 0) return NextResponse.json({ rounds: [] });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoWeeksOut = new Date(today);
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: {
      id: true,
      name: true,
      ageGroup: true,
      players: {
        select: {
          player: {
            select: { id: true, firstName: true, surname: true, parent1: true, familyId: true },
          },
        },
      },
      rounds: {
        where: { date: { gte: today, lte: twoWeeksOut } },
        orderBy: { date: "asc" },
        select: {
          id: true,
          roundNumber: true,
          date: true,
          gameTime: true,
          opponent: true,
          venue: true,
          court: true,
          isHome: true,
          isBye: true,
          isRosterLocked: true,
        },
      },
    },
  });

  const allRoundIds: string[] = [];
  const allUserFamilyIds = new Set<string>();

  const teamContexts = teams.map((team) => {
    const allPlayers = team.players.map((tp) => tp.player);
    const userPlayerIds = new Set(allPlayers.filter((p) => p.familyId === userId).map((p) => p.id));

    const families = deriveFamiliesWithPlayers(allPlayers);
    const userFamilyIds = families
      .filter((f) => f.playerIds.some((pid) => userPlayerIds.has(pid)))
      .map((f) => f.id);

    const userChildren = allPlayers.filter((p) => p.familyId === userId);
    userFamilyIds.forEach((id) => allUserFamilyIds.add(id));
    team.rounds.forEach((r) => allRoundIds.push(r.id));

    return { team, userChildren, userFamilyIds, rounds: team.rounds };
  });

  const assignments =
    allUserFamilyIds.size > 0 && allRoundIds.length > 0
      ? await prisma.rosterAssignment.findMany({
          where: {
            roundId: { in: allRoundIds },
            assignedFamilyId: { in: Array.from(allUserFamilyIds) },
          },
          select: {
            roundId: true,
            assignedFamilyId: true,
            assignedFamilyName: true,
            teamDutyRole: {
              select: { dutyRole: { select: { roleName: true } } },
            },
          },
        })
      : [];

  const assignmentsByRound = new Map<string, typeof assignments>();
  for (const a of assignments) {
    if (!assignmentsByRound.has(a.roundId)) assignmentsByRound.set(a.roundId, []);
    assignmentsByRound.get(a.roundId)!.push(a);
  }

  const rounds = teamContexts
    .flatMap(({ team, userChildren, rounds }) =>
      rounds.map((round) => ({
        id: round.id,
        teamId: team.id,
        teamName: team.name,
        ageGroup: team.ageGroup,
        children: userChildren.map((p) => ({ id: p.id, firstName: p.firstName, surname: p.surname })),
        roundNumber: round.roundNumber,
        date: round.date,
        gameTime: round.gameTime,
        opponent: round.opponent,
        venue: round.venue,
        court: round.court,
        isHome: round.isHome,
        isBye: round.isBye,
        isRosterLocked: round.isRosterLocked,
        duties: (assignmentsByRound.get(round.id) ?? []).map((a) => ({
          roleName: a.teamDutyRole.dutyRole.roleName,
          assignedFamilyName: a.assignedFamilyName,
        })),
      }))
    )
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

  return NextResponse.json({ rounds });
}
