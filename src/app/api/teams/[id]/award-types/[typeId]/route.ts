import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string; typeId: string } }) {
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

  const { name, description, quantity } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Check for duplicate name (excluding current)
  const existing = await prisma.awardType.findFirst({
    where: { teamId, name: name.trim(), NOT: { id: params.typeId } },
  });
  if (existing) {
    return NextResponse.json({ error: "An award type with this name already exists" }, { status: 409 });
  }

  const awardType = await prisma.awardType.update({
    where: { id: params.typeId },
    data: {
      name: name.trim(),
      description: description || null,
      quantity: quantity || 1,
    },
  });

  return NextResponse.json(awardType);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; typeId: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (role === Role.TEAM_MANAGER) {
    const userTeamId = (session!.user as Record<string, unknown>)?.teamId as string;
    if (params.id !== userTeamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await prisma.awardType.delete({ where: { id: params.typeId } });

  return NextResponse.json({ success: true });
}
