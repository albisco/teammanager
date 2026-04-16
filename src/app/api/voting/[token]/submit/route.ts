import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { voterName, voterType, rankings } = await req.json();

  if (!voterName || !voterType || !rankings || !Array.isArray(rankings)) {
    return NextResponse.json({ error: "voterName, voterType, and rankings are required" }, { status: 400 });
  }

  if (!["PARENT", "COACH", "PLAYER"].includes(voterType)) {
    return NextResponse.json({ error: "Invalid voterType" }, { status: 400 });
  }

  const votingSession = await prisma.votingSession.findUnique({
    where: { qrToken: params.token },
    include: {
      round: {
        include: {
          team: {
            include: {
              season: { include: { club: { select: { id: true, maxVotesPerRound: true } } } },
            },
          },
        },
      },
    },
  });

  if (!votingSession) {
    return NextResponse.json({ error: "Voting session not found" }, { status: 404 });
  }

  if (votingSession.status !== "OPEN") {
    return NextResponse.json({ error: "Voting is closed for this round" }, { status: 400 });
  }

  const maxVotes = votingSession.round.team.season.club.maxVotesPerRound;

  // Validate rankings: unique player IDs
  const playerIds = rankings.map((r: { playerId: string }) => r.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    return NextResponse.json({ error: "Each player can only appear once in rankings" }, { status: 400 });
  }

  // Validate rankings match voting scheme length
  const votingScheme = votingSession.round.team.votingScheme as number[];
  if (rankings.length !== votingScheme.length) {
    return NextResponse.json({
      error: `Expected ${votingScheme.length} rankings, got ${rankings.length}`,
    }, { status: 400 });
  }

  // Find or create a voter user for this name (anonymous voter)
  // We use a convention: anonymous voters get a deterministic ID based on session + name
  const voterId = `anon_${votingSession.id}_${voterName.toLowerCase().replace(/\s+/g, "_")}`;

  // Check if already voted
  const existingVote = await prisma.vote.findFirst({
    where: {
      votingSessionId: votingSession.id,
      voterId,
    },
  });

  if (existingVote) {
    return NextResponse.json({ error: "You have already voted for this round" }, { status: 400 });
  }

  // Ensure anonymous voter user exists
  let voter = await prisma.user.findUnique({ where: { id: voterId } });
  if (!voter) {
    voter = await prisma.user.create({
      data: {
        id: voterId,
        email: `${voterId}@anonymous.local`,
        passwordHash: "anonymous",
        name: voterName,
        role: "FAMILY",
        clubId: votingSession.round.team.season.clubId,
      },
    });
  }

  // Add points to rankings
  const rankedWithPoints = rankings.map((r: { playerId: string }, i: number) => ({
    playerId: r.playerId,
    points: votingScheme[i],
  }));

  try {
    const { vote, sessionClosed } = await prisma.$transaction(async (tx) => {
      // Re-check current session status + vote count inside the transaction to
      // guard against races where two concurrent submits both see count = max-1.
      const current = await tx.votingSession.findUnique({
        where: { id: votingSession.id },
        select: { status: true, _count: { select: { votes: true } } },
      });
      if (!current || current.status !== "OPEN") {
        throw new Error("SESSION_CLOSED");
      }
      if (current._count.votes >= maxVotes) {
        await tx.votingSession.update({
          where: { id: votingSession.id },
          data: { status: "CLOSED" },
        });
        throw new Error("SESSION_FULL");
      }

      const created = await tx.vote.create({
        data: {
          votingSessionId: votingSession.id,
          voterId,
          voterType,
          rankings: rankedWithPoints,
        },
      });

      const newCount = current._count.votes + 1;
      let closed = false;
      if (newCount >= maxVotes) {
        await tx.votingSession.update({
          where: { id: votingSession.id },
          data: { status: "CLOSED" },
        });
        closed = true;
      }
      return { vote: created, sessionClosed: closed };
    });

    return NextResponse.json({ ...vote, sessionClosed }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && (err.message === "SESSION_CLOSED" || err.message === "SESSION_FULL")) {
      return NextResponse.json(
        { error: "Voting is closed for this round" },
        { status: 400 },
      );
    }
    throw err;
  }
}
