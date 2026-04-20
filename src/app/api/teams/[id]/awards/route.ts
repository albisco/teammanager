import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = params.id;

  // TEAM_MANAGER: verify this team is theirs
  if (role === Role.TEAM_MANAGER) {
    const userTeamId = (session!.user as Record<string, unknown>)?.teamId as string;
    if (teamId !== userTeamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { enableAwards: true } });
  if (!team?.enableAwards) return NextResponse.json({ error: "Awards disabled for this team" }, { status: 403 });

  const [rounds, awardTypes, awards, teamPlayers] = await Promise.all([
    prisma.round.findMany({
      where: { teamId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, isBye: true, date: true, opponent: true },
    }),
    prisma.awardType.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
    }),
    prisma.award.findMany({
      where: { round: { teamId } },
      include: { player: { select: { id: true, firstName: true, surname: true } } },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: { select: { id: true, firstName: true, surname: true } } },
    }),
  ]);

  // Build award map: key = "roundId:awardTypeId"
  const awardMap: Record<string, Array<{ slot: number; playerId: string; playerName: string; notes: string | null }>> = {};
  // Build tally: playerId -> awardTypeId -> count
  const tally: Record<string, Record<string, number>> = {};

  for (const a of awards) {
    const key = `${a.roundId}:${a.awardTypeId}`;
    if (!awardMap[key]) awardMap[key] = [];
    awardMap[key].push({
      slot: a.slot,
      playerId: a.playerId,
      playerName: `${a.player.firstName} ${a.player.surname}`,
      notes: a.notes,
    });

    if (!tally[a.playerId]) tally[a.playerId] = {};
    tally[a.playerId][a.awardTypeId] = (tally[a.playerId][a.awardTypeId] || 0) + 1;
  }

  // Sort slots
  for (const key of Object.keys(awardMap)) {
    awardMap[key].sort((a, b) => a.slot - b.slot);
  }

  const players = teamPlayers
    .map((tp) => ({ id: tp.player.id, name: `${tp.player.firstName} ${tp.player.surname}` }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    rounds,
    awardTypes: awardTypes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      quantity: t.quantity,
    })),
    awardMap,
    players,
    tally,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = params.id;
  if (role === Role.TEAM_MANAGER) {
    const userTeamId = (session!.user as Record<string, unknown>)?.teamId as string;
    if (teamId !== userTeamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const teamGate = await prisma.team.findUnique({ where: { id: teamId }, select: { enableAwards: true } });
  if (!teamGate?.enableAwards) return NextResponse.json({ error: "Awards disabled for this team" }, { status: 403 });

  const { roundId, awardTypeId, slot, playerId, notes } = await req.json();

  if (!roundId || !awardTypeId || slot === undefined) {
    return NextResponse.json({ error: "roundId, awardTypeId, and slot are required" }, { status: 400 });
  }

  // Clear slot
  if (!playerId) {
    await prisma.award.deleteMany({
      where: { roundId, awardTypeId, slot },
    });
    return NextResponse.json({ success: true });
  }

  // Upsert award
  const award = await prisma.award.upsert({
    where: { roundId_awardTypeId_slot: { roundId, awardTypeId, slot } },
    create: { roundId, awardTypeId, slot, playerId, notes: notes || null },
    update: { playerId, notes: notes || null },
  });

  return NextResponse.json(award);
}
