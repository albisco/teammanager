import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveFamiliesWithPlayers } from "@/lib/roster-algorithm";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { voterName, voterType, rankings, familyId, coachStaffId, voterPlayerId } = await req.json();

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
              season: {
                include: {
                  club: {
                    select: {
                      id: true,
                      maxVotesPerRound: true,
                      enforceFamilyVoteExclusion: true,
                    },
                  },
                },
              },
              players: {
                include: {
                  player: {
                    select: { id: true, surname: true, firstName: true, parent1: true },
                  },
                },
              },
              staff: {
                where: { role: { in: ["HEAD_COACH", "ASSISTANT_COACH"] } },
                include: { user: { select: { name: true } } },
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

  if (votingSession.status !== "OPEN") {
    return NextResponse.json({ error: "Voting is closed for this round" }, { status: 400 });
  }

  const team = votingSession.round.team;
  const club = team.season.club;
  const maxVotes = club.maxVotesPerRound;

  // Validate rankings: unique player IDs
  const playerIds = rankings.map((r: { playerId: string }) => r.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    return NextResponse.json({ error: "Each player can only appear once in rankings" }, { status: 400 });
  }

  // Self-vote block: PLAYER voters cannot vote for themselves
  if (voterType === "PLAYER") {
    if (!voterPlayerId) {
      return NextResponse.json({ error: "voterPlayerId required for PLAYER voter" }, { status: 400 });
    }
    if (playerIds.includes(voterPlayerId)) {
      return NextResponse.json({ error: "You cannot vote for yourself" }, { status: 400 });
    }
  }

  // For self-managed teams, only PLAYER voters allowed
  if (votingSession.round.team.selfManaged && voterType !== "PLAYER") {
    return NextResponse.json({ error: "This team accepts player votes only" }, { status: 400 });
  }

  // Validate rankings match voting scheme length
  const votingScheme = team.votingScheme as number[];
  if (rankings.length !== votingScheme.length) {
    return NextResponse.json({
      error: `Expected ${votingScheme.length} rankings, got ${rankings.length}`,
    }, { status: 400 });
  }

  // Resolve voterId / effective voter name based on voter type.
  let voterId: string;
  let effectiveVoterName = voterName;

  if (voterType === "PARENT") {
    if (club.enforceFamilyVoteExclusion) {
      if (!familyId) {
        return NextResponse.json({ error: "Select your family" }, { status: 400 });
      }
      const families = deriveFamiliesWithPlayers(team.players.map((tp) => tp.player));
      const family = families.find((f) => f.id === familyId);
      if (!family) {
        return NextResponse.json({ error: "Unknown family" }, { status: 400 });
      }
      voterId = `anon_${votingSession.id}_parent_${familyId}`;
    } else {
      voterId = `anon_${votingSession.id}_${String(voterName).toLowerCase().replace(/\s+/g, "_")}`;
    }
  } else if (voterType === "COACH") {
    if (team.staff.length === 0) {
      return NextResponse.json(
        { error: "No coach seats are configured for this team" },
        { status: 400 },
      );
    }
    if (!coachStaffId) {
      return NextResponse.json({ error: "Select which coach you are" }, { status: 400 });
    }
    const staffRow = team.staff.find((s) => s.id === coachStaffId);
    if (!staffRow) {
      return NextResponse.json({ error: "Unknown coach seat" }, { status: 400 });
    }
    voterId = `anon_${votingSession.id}_coachstaff_${coachStaffId}`;
    effectiveVoterName = staffRow.user?.name ?? staffRow.displayName ?? voterName;
  } else {
    // PLAYER — adult-club path, unchanged free-text keying
    voterId = `anon_${votingSession.id}_${String(voterName).toLowerCase().replace(/\s+/g, "_")}`;
  }

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
        name: effectiveVoterName,
        role: "FAMILY",
        clubId: team.season.clubId,
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

      // PARENT quota: total PARENT votes cannot exceed team.parentVoterCount.
      if (voterType === "PARENT") {
        const parentCount = await tx.vote.count({
          where: { votingSessionId: votingSession.id, voterType: "PARENT" },
        });
        if (parentCount >= team.parentVoterCount) {
          throw new Error("PARENT_FULL");
        }
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
    if (err instanceof Error) {
      if (err.message === "SESSION_CLOSED" || err.message === "SESSION_FULL") {
        return NextResponse.json(
          { error: "Voting is closed for this round" },
          { status: 400 },
        );
      }
      if (err.message === "PARENT_FULL") {
        return NextResponse.json(
          { error: "Family voter limit reached" },
          { status: 400 },
        );
      }
    }
    // Unique-constraint violation on (votingSessionId, voterId) — race between
    // two submits for the same family / seat / name.
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "You have already voted for this round" },
        { status: 400 },
      );
    }
    throw err;
  }
}
