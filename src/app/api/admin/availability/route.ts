import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as Record<string, unknown>)?.role;
  if (!session || (role !== "ADMIN" && role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

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

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

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

  return NextResponse.json({ players, rounds, playerAvailabilityToken: team.playerAvailabilityToken });
}
