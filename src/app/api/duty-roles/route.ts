import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchTeamStaffRole } from "@/lib/roles";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const roles = await prisma.dutyRole.findMany({
    where: { clubId, teamId: null },
    orderBy: [{ sortOrder: "asc" }, { roleName: "asc" }],
  });

  return NextResponse.json(roles);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roleName, isVotingRole } = await req.json();
  if (!roleName?.trim()) {
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  }

  const clubId = (session!.user as Record<string, unknown>)?.clubId as string;

  try {
    const maxRole = await prisma.dutyRole.findFirst({
      where: { clubId, teamId: null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const nextSortOrder = (maxRole?.sortOrder ?? -1) + 1;

    const trimmedName = roleName.trim();
    const role = await prisma.dutyRole.create({
      data: {
        roleName: trimmedName,
        clubId,
        sortOrder: nextSortOrder,
        isVotingRole: !!isVotingRole,
        teamStaffRole: matchTeamStaffRole(trimmedName),
      },
    });
    return NextResponse.json(role, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const { id, roleName, isVotingRole } = await req.json();
  if (!id || !roleName?.trim()) {
    return NextResponse.json({ error: "ID and role name are required" }, { status: 400 });
  }

  const existingRole = await prisma.dutyRole.findUnique({ where: { id } });
  if (!existingRole || existingRole.clubId !== clubId || existingRole.teamId !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const trimmedName = roleName.trim();
    const role = await prisma.dutyRole.update({
      where: { id },
      data: {
        roleName: trimmedName,
        isVotingRole: isVotingRole !== undefined ? !!isVotingRole : undefined,
        teamStaffRole: matchTeamStaffRole(trimmedName),
      },
    });
    return NextResponse.json(role);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const { orderedIds } = await req.json();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds array is required" }, { status: 400 });
  }

  // Verify all IDs belong to this club (club-wide only)
  const roles = await prisma.dutyRole.findMany({
    where: { clubId, teamId: null },
    select: { id: true },
  });
  const validIds = new Set(roles.map((r) => r.id));
  for (const id of orderedIds) {
    if (!validIds.has(id)) {
      return NextResponse.json({ error: "Invalid role ID" }, { status: 400 });
    }
  }

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.dutyRole.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const existingRole = await prisma.dutyRole.findUnique({ where: { id } });
  if (!existingRole || existingRole.clubId !== clubId || existingRole.teamId !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.dutyRole.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
