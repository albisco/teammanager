import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const player = await prisma.player.findUnique({
    where: { id: params.id },
    include: { family: { select: { id: true, name: true } } },
  });

  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(player);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { jumperNumber, firstName, surname, dateOfBirth, phone, contactEmail, parent1, parent2, spare1, spare2, familyId } = body;

  const player = await prisma.player.update({
    where: { id: params.id },
    data: {
      jumperNumber: jumperNumber != null ? parseInt(jumperNumber) : undefined,
      firstName: firstName || undefined,
      surname: surname || undefined,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      phone: phone ?? undefined,
      contactEmail: contactEmail ?? undefined,
      parent1: parent1 ?? undefined,
      parent2: parent2 ?? undefined,
      spare1: spare1 ?? undefined,
      spare2: spare2 ?? undefined,
      familyId: familyId ?? undefined,
    },
  });

  return NextResponse.json(player);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.player.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
