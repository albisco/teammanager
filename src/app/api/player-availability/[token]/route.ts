import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public endpoint — no auth required. Token identifies the team.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const team = await prisma.team.findUnique({
    where: { playerAvailabilityToken: params.token },
    include: {
      rounds: {
        orderBy: { roundNumber: "asc" },
        select: { id: true, roundNumber: true, date: true, opponent: true, venue: true, isBye: true },
      },
      players: {
        include: {
          player: { select: { id: true, firstName: true, surname: true, jumperNumber: true } },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const players = team.players
    .map((tp) => tp.player)
    .sort((a, b) => a.jumperNumber - b.jumperNumber);

  const availabilities = await prisma.playerAvailability.findMany({
    where: { round: { teamId: team.id } },
    select: { playerId: true, roundId: true, status: true },
  });

  return NextResponse.json({
    teamName: team.name,
    ageGroup: team.ageGroup,
    players,
    rounds: team.rounds,
    availabilities,
  });
}
