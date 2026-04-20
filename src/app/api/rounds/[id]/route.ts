import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { roundNumber, date, gameTime, isBye, opponent, venue } = body;

  const round = await prisma.round.update({
    where: { id: params.id },
    data: {
      roundNumber: roundNumber != null ? parseInt(roundNumber) : undefined,
      date: date !== undefined ? (date ? new Date(date) : null) : undefined,
      gameTime: gameTime !== undefined ? (gameTime || null) : undefined,
      isBye: isBye !== undefined ? isBye : undefined,
      opponent: opponent !== undefined ? (opponent || null) : undefined,
      venue: venue !== undefined ? (venue || null) : undefined,
    },
  });

  return NextResponse.json(round);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (role === Role.TEAM_MANAGER) {
    const userId = (session!.user as { id: string }).id;
    const round = await prisma.round.findUnique({ where: { id: params.id }, select: { team: { select: { managerId: true } } } });
    if (round?.team.managerId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.round.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
