import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["AVAILABLE", "MAYBE", "UNAVAILABLE"] as const;
type Status = (typeof VALID_STATUSES)[number];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "FAMILY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { playerId, roundId, status } = await req.json();

  if (!playerId || !roundId || !status) {
    return NextResponse.json({ error: "playerId, roundId, and status are required" }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status as Status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Verify this player belongs to the logged-in family user
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { familyId: true, clubId: true },
  });
  if (!player || player.familyId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify the round belongs to a team this player is on
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { teamId: true, isBye: true },
  });
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
  if (round.isBye) return NextResponse.json({ error: "Cannot set availability for a bye" }, { status: 400 });

  const membership = await prisma.teamPlayer.findUnique({
    where: { teamId_playerId: { teamId: round.teamId, playerId } },
  });
  if (!membership) return NextResponse.json({ error: "Player not on this team" }, { status: 400 });

  await prisma.playerAvailability.upsert({
    where: { playerId_roundId: { playerId, roundId } },
    create: { playerId, roundId, status: status as Status },
    update: { status: status as Status },
  });

  return NextResponse.json({ ok: true, status });
}
