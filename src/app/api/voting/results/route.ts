import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = req.nextUrl.searchParams.get("teamId");
  const roundId = req.nextUrl.searchParams.get("roundId");

  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  // Get all players for this team
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { teamId },
    include: { player: { select: { id: true, firstName: true, surname: true, jumperNumber: true } } },
  });

  // Get votes — either for a specific round or all rounds in the team
  const whereClause = roundId
    ? { votingSession: { round: { id: roundId } } }
    : { votingSession: { round: { teamId } } };

  const votes = await prisma.vote.findMany({
    where: whereClause,
    include: {
      votingSession: {
        include: { round: { select: { id: true, roundNumber: true } } },
      },
      voter: { select: { id: true, name: true } },
    },
  });

  // Tally points per player
  const tally: Record<string, { total: number; byRound: Record<string, number> }> = {};
  for (const tp of teamPlayers) {
    tally[tp.player.id] = { total: 0, byRound: {} };
  }

  for (const vote of votes) {
    const rankings = vote.rankings as { playerId: string; points: number }[];
    const rId = vote.votingSession.round.id;
    for (const r of rankings) {
      if (tally[r.playerId]) {
        tally[r.playerId].total += r.points;
        tally[r.playerId].byRound[rId] = (tally[r.playerId].byRound[rId] || 0) + r.points;
      }
    }
  }

  // Build leaderboard
  const leaderboard = teamPlayers
    .map((tp) => ({
      player: tp.player,
      totalPoints: tally[tp.player.id]?.total || 0,
      byRound: tally[tp.player.id]?.byRound || {},
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Build audit trail
  const audit = votes.map((vote) => ({
    voterName: vote.voter.name,
    voterType: vote.voterType,
    roundNumber: vote.votingSession.round.roundNumber,
    rankings: vote.rankings as { playerId: string; points: number }[],
    submittedAt: vote.submittedAt,
  }));

  // Build player name lookup for the audit
  const playerMap: Record<string, string> = {};
  for (const tp of teamPlayers) {
    playerMap[tp.player.id] = `${tp.player.firstName} ${tp.player.surname}`;
  }

  return NextResponse.json({ leaderboard, voteCount: votes.length, audit, playerMap });
}
