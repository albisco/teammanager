import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clubId = (session!.user as Record<string, unknown>)?.clubId as string;

  const roles = await prisma.dutyRole.findMany({
    where: { clubId },
    orderBy: { roleName: "asc" },
  });

  return NextResponse.json(roles);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roleName } = await req.json();
  if (!roleName?.trim()) {
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  }

  const clubId = (session!.user as Record<string, unknown>)?.clubId as string;

  try {
    const role = await prisma.dutyRole.create({ data: { roleName: roleName.trim(), clubId } });
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
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session!.user as Record<string, unknown>)?.clubId as string;
  const { id, roleName } = await req.json();
  if (!id || !roleName?.trim()) {
    return NextResponse.json({ error: "ID and role name are required" }, { status: 400 });
  }

  const existingRole = await prisma.dutyRole.findUnique({ where: { id } });
  if (!existingRole || existingRole.clubId !== clubId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const role = await prisma.dutyRole.update({
      where: { id },
      data: { roleName: roleName.trim() },
    });
    return NextResponse.json(role);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session!.user as Record<string, unknown>)?.clubId as string;
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const existingRole = await prisma.dutyRole.findUnique({ where: { id } });
  if (!existingRole || existingRole.clubId !== clubId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.dutyRole.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
