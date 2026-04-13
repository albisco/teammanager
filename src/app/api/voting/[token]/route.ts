import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public endpoint — get voting session info by QR token
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const votingSession = await prisma.votingSession.findUnique({
    where: { qrToken: params.token },
    include: {
      round: {
        include: {
          team: {
            include: {
              season: {
                include: {
                  club: { select: { isAdultClub: true } },
                },
              },
              players: {
                include: {
                  player: { select: { id: true, firstName: true, surname: true, jumperNumber: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!votingSession) {
    return NextResponse.json({ error: "Voting session not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: votingSession.id,
    status: votingSession.status,
    isAdultClub: votingSession.round.team.season.club.isAdultClub,
    round: {
      roundNumber: votingSession.round.roundNumber,
      opponent: votingSession.round.opponent,
      date: votingSession.round.date,
    },
    team: {
      name: votingSession.round.team.name,
      ageGroup: votingSession.round.team.ageGroup,
      seasonName: votingSession.round.team.season.name,
      votingScheme: votingSession.round.team.votingScheme,
    },
    players: votingSession.round.team.players
      .map((tp) => tp.player)
      .sort((a, b) => a.jumperNumber - b.jumperNumber),
  });
}
