import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findOrCreateFamily } from "@/lib/link-family";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const player = await prisma.player.findUnique({
    where: { id: params.id },
    include: { family: { select: { id: true, name: true } } },
  });

  if (!player || player.clubId !== clubId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(player);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const existing = await prisma.player.findUnique({ where: { id: params.id } });
  if (!existing || existing.clubId !== clubId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { jumperNumber, firstName, surname, dateOfBirth, phone, contactEmail, parent1, parent2, spare1, spare2, familyId } = body;

  // Check for duplicate if name is changing
  const newFirstName = firstName || existing.firstName;
  const newSurname = surname || existing.surname;
  if (newFirstName !== existing.firstName || newSurname !== existing.surname) {
    const duplicate = await prisma.player.findUnique({
      where: { clubId_firstName_surname: { clubId, firstName: newFirstName, surname: newSurname } },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `${newFirstName} ${newSurname} is already registered in this club` },
        { status: 409 }
      );
    }
  }

  // Auto-link family if parent1 changed and no explicit familyId
  let resolvedFamilyId = familyId ?? undefined;
  if (parent1 !== undefined && !familyId && !existing.familyId) {
    const linked = await findOrCreateFamily(clubId, parent1, contactEmail ?? existing.contactEmail);
    if (linked) resolvedFamilyId = linked;
  }

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
      familyId: resolvedFamilyId,
    },
  });

  return NextResponse.json(player);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const existing = await prisma.player.findUnique({ where: { id: params.id } });
  if (!existing || existing.clubId !== clubId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.player.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
