import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveFamilies } from "@/lib/roster-algorithm";

// Public endpoint — no auth required. Token identifies the team.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const team = await prisma.team.findUnique({
    where: { availabilityToken: params.token },
    include: {
      season: {
        select: {
          club: { select: { name: true, logoUrl: true } },
        },
      },
      rounds: {
        orderBy: { roundNumber: "asc" },
        select: { id: true, roundNumber: true, date: true, gameTime: true, isBye: true },
      },
      players: {
        include: {
          player: { select: { surname: true, firstName: true, parent1: true } },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const families = deriveFamilies(team.players.map((tp) => tp.player)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const unavailabilities = await prisma.familyUnavailability.findMany({
    where: { round: { teamId: team.id } },
    select: { familyId: true, roundId: true },
  });

  return NextResponse.json({
    club: team.season.club,
    teamName: team.name,
    ageGroup: team.ageGroup,
    families,
    rounds: team.rounds,
    unavailabilities,
  });
}
