import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET voting sessions for a team
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const rounds = await prisma.round.findMany({
    where: { teamId },
    include: {
      votingSession: {
        include: { _count: { select: { votes: true } } },
      },
    },
    orderBy: { roundNumber: "asc" },
  });

  return NextResponse.json(rounds);
}

// POST: open voting for a round
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roundId } = await req.json();
  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  // Check if session already exists
  const existing = await prisma.votingSession.findUnique({ where: { roundId } });
  if (existing) {
    return NextResponse.json({ error: "Voting session already exists for this round" }, { status: 400 });
  }

  const votingSession = await prisma.votingSession.create({
    data: { roundId, status: "OPEN" },
  });

  return NextResponse.json(votingSession, { status: 201 });
}

// PUT: close/reopen voting for a round
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { votingSessionId, status } = await req.json();
  if (!votingSessionId || !["OPEN", "CLOSED"].includes(status)) {
    return NextResponse.json({ error: "votingSessionId and valid status required" }, { status: 400 });
  }

  const votingSession = await prisma.votingSession.update({
    where: { id: votingSessionId },
    data: { status },
  });

  return NextResponse.json(votingSession);
}
