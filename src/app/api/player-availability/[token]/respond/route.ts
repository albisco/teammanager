import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public endpoint — no auth required.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { playerId, roundId, status } = await req.json();

  if (!playerId || !roundId || !status) {
    return NextResponse.json({ error: "playerId, roundId, and status are required" }, { status: 400 });
  }

  if (!["AVAILABLE", "MAYBE", "UNAVAILABLE"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { playerAvailabilityToken: params.token },
    select: { id: true },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Verify the player is on this team
  const membership = await prisma.teamPlayer.findUnique({
    where: { teamId_playerId: { teamId: team.id, playerId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Player not on this team" }, { status: 400 });
  }

  // Verify the round belongs to this team and is not a bye
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { teamId: true, isBye: true },
  });
  if (!round || round.teamId !== team.id) {
    return NextResponse.json({ error: "Round not found for this team" }, { status: 400 });
  }
  if (round.isBye) {
    return NextResponse.json({ error: "Cannot submit availability for a bye round" }, { status: 400 });
  }

  await prisma.playerAvailability.upsert({
    where: { playerId_roundId: { playerId, roundId } },
    create: { playerId, roundId, status },
    update: { status },
  });

  return NextResponse.json({ ok: true });
}
