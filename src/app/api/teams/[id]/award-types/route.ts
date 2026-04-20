import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  const { name, description, quantity } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const existing = await prisma.awardType.findUnique({
    where: { teamId_name: { teamId, name: name.trim() } },
  });
  if (existing) {
    return NextResponse.json({ error: "An award type with this name already exists" }, { status: 409 });
  }

  const awardType = await prisma.awardType.create({
    data: {
      teamId,
      name: name.trim(),
      description: description || null,
      quantity: quantity || 1,
    },
  });

  return NextResponse.json(awardType, { status: 201 });
}
