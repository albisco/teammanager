import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // TEAM_MANAGER: verify round belongs to their team
  if (role === "TEAM_MANAGER") {
    const teamId = (session!.user as Record<string, unknown>)?.teamId as string;
    const existing = await prisma.round.findUnique({ where: { id: params.id }, select: { teamId: true } });
    if (!existing || existing.teamId !== teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();
  const { roundNumber, date, isBye, opponent, venue } = body;

  // TEAM_MANAGER can only update opponent, venue, date — not roundNumber or isBye
  const isManager = role === "TEAM_MANAGER";

  const round = await prisma.round.update({
    where: { id: params.id },
    data: {
      roundNumber: !isManager && roundNumber != null ? parseInt(roundNumber) : undefined,
      date: date !== undefined ? (date ? new Date(date) : null) : undefined,
      isBye: !isManager && isBye !== undefined ? isBye : undefined,
      opponent: opponent !== undefined ? (opponent || null) : undefined,
      venue: venue !== undefined ? (venue || null) : undefined,
    },
  });

  return NextResponse.json(round);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.round.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
