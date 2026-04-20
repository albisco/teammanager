import { prisma } from "@/lib/prisma";

export async function loadTeamAvailability(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: {
        include: {
          player: { select: { id: true, firstName: true, surname: true, jumperNumber: true } },
        },
      },
      rounds: {
        orderBy: { roundNumber: "asc" },
        where: { isBye: false },
        include: {
          playerAvailabilities: {
            include: {
              player: { select: { id: true, firstName: true, surname: true, jumperNumber: true } },
            },
          },
        },
      },
    },
  });

  if (!team) return null;

  const players = team.players
    .map((tp) => tp.player)
    .sort((a, b) => a.jumperNumber - b.jumperNumber);

  const rounds = team.rounds.map((r) => ({
    id: r.id,
    roundNumber: r.roundNumber,
    date: r.date,
    opponent: r.opponent,
    venue: r.venue,
    availabilities: r.playerAvailabilities.map((pa) => ({
      playerId: pa.playerId,
      playerName: `${pa.player.firstName} ${pa.player.surname}`,
      jumperNumber: pa.player.jumperNumber,
      status: pa.status,
    })),
  }));

  return {
    team,
    players,
    rounds,
    playerAvailabilityToken: team.playerAvailabilityToken,
  };
}
