import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAuthorized(role: string | undefined, teamId: string, sessionTeamId: string | null) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (role === "TEAM_MANAGER" && teamId === sessionTeamId) return true;
  return false;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [rounds, awardTypes, awards, teamPlayers] = await Promise.all([
    prisma.round.findMany({
      where: { teamId: params.id },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, isBye: true, date: true, opponent: true },
    }),
    prisma.awardType.findMany({
      where: { teamId: params.id },
      orderBy: { name: "asc" },
    }),
    prisma.award.findMany({
      where: { round: { teamId: params.id } },
      include: { player: { select: { id: true, firstName: true, surname: true } } },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId: params.id },
      include: { player: { select: { id: true, firstName: true, surname: true } } },
      orderBy: { player: { surname: "asc" } },
    }),
  ]);

  // Build award map: key = "roundId:awardTypeId" -> array of { slot, playerId, playerName, notes }
  const awardMap: Record<string, Array<{ slot: number; playerId: string; playerName: string; notes: string | null }>> = {};
  for (const a of awards) {
    const key = `${a.roundId}:${a.awardTypeId}`;
    if (!awardMap[key]) awardMap[key] = [];
    awardMap[key].push({
      slot: a.slot,
      playerId: a.player.id,
      playerName: `${a.player.firstName} ${a.player.surname}`,
      notes: a.notes,
    });
  }
  for (const key of Object.keys(awardMap)) {
    awardMap[key].sort((a, b) => a.slot - b.slot);
  }

  // Build season tally: playerId -> awardTypeId -> count
  const tally: Record<string, Record<string, number>> = {};
  for (const a of awards) {
    if (!tally[a.playerId]) tally[a.playerId] = {};
    tally[a.playerId][a.awardTypeId] = (tally[a.playerId][a.awardTypeId] || 0) + 1;
  }

  return NextResponse.json({
    rounds,
    awardTypes,
    awardMap,
    players: teamPlayers.map((tp) => ({
      id: tp.player.id,
      name: `${tp.player.firstName} ${tp.player.surname}`,
    })),
    tally,
  });
}

// Upsert a single award slot
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const sessionTeamId = (session?.user as Record<string, unknown>)?.teamId as string | null;

  if (!isAuthorized(role, params.id, sessionTeamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roundId, awardTypeId, slot = 0, playerId, notes } = await req.json();
  if (!roundId || !awardTypeId) {
    return NextResponse.json({ error: "roundId and awardTypeId are required" }, { status: 400 });
  }

  // Clear the slot
  if (!playerId) {
    await prisma.award.deleteMany({ where: { roundId, awardTypeId, slot } });
    return NextResponse.json({ success: true });
  }

  const award = await prisma.award.upsert({
    where: { roundId_awardTypeId_slot: { roundId, awardTypeId, slot } },
    create: { roundId, awardTypeId, playerId, slot, notes: notes || null },
    update: { playerId, notes: notes || null },
    include: { player: { select: { id: true, firstName: true, surname: true } } },
  });

  return NextResponse.json(award);
}
