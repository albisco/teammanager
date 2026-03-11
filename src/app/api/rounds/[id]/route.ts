import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { roundNumber, date, isBye, opponent, venue } = body;

  const round = await prisma.round.update({
    where: { id: params.id },
    data: {
      roundNumber: roundNumber != null ? parseInt(roundNumber) : undefined,
      date: date !== undefined ? (date ? new Date(date) : null) : undefined,
      isBye: isBye !== undefined ? isBye : undefined,
      opponent: opponent !== undefined ? (opponent || null) : undefined,
      venue: venue !== undefined ? (venue || null) : undefined,
    },
  });

  return NextResponse.json(round);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.round.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
