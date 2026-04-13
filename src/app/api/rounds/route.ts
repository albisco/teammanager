import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const rounds = await prisma.round.findMany({
    where: { teamId },
    orderBy: { roundNumber: "asc" },
  });

  return NextResponse.json(rounds);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { teamId, roundNumber, date, gameTime, isBye, opponent, venue } = body;

  if (!teamId || roundNumber == null) {
    return NextResponse.json({ error: "teamId and roundNumber are required" }, { status: 400 });
  }

  const round = await prisma.round.create({
    data: {
      teamId,
      roundNumber: parseInt(roundNumber),
      date: date ? new Date(date) : null,
      gameTime: gameTime || null,
      isBye: isBye || false,
      opponent: opponent || null,
      venue: venue || null,
    },
  });

  return NextResponse.json(round, { status: 201 });
}
