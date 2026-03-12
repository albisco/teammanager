import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const players = await prisma.player.findMany({
    where: { clubId },
    include: {
      family: { select: { id: true, name: true } },
      teamPlayers: {
        include: { team: { select: { id: true, name: true, ageGroup: true } } },
      },
    },
    orderBy: [{ surname: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json(players);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { jumperNumber, firstName, surname, dateOfBirth, phone, contactEmail, parent1, parent2, spare1, spare2, familyId } = body;

  if (!firstName || !surname || jumperNumber == null) {
    return NextResponse.json({ error: "First name, surname, and jumper number are required" }, { status: 400 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const player = await prisma.player.create({
    data: {
      clubId,
      jumperNumber: parseInt(jumperNumber),
      firstName,
      surname,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      phone: phone || null,
      contactEmail: contactEmail || null,
      parent1: parent1 || null,
      parent2: parent2 || null,
      spare1: spare1 || null,
      spare2: spare2 || null,
      familyId: familyId || null,
    },
  });

  return NextResponse.json(player, { status: 201 });
}
