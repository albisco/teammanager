import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await prisma.dutyRole.findUnique({
    where: { id: params.roleId },
    include: {
      assignedUser: { select: { id: true, name: true } },
      specialists: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  if (!role || role.teamId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(role);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { roleName, roleType, assignedUserId, frequencyWeeks, specialistUserIds } = body;

  try {
    // Delete existing specialists before updating
    await prisma.dutyRoleSpecialist.deleteMany({ where: { dutyRoleId: params.roleId } });

    const role = await prisma.dutyRole.update({
      where: { id: params.roleId },
      data: {
        roleName: roleName || undefined,
        roleType: roleType || undefined,
        assignedUserId: roleType === "FIXED" ? assignedUserId : null,
        frequencyWeeks: roleType === "FREQUENCY" ? (parseInt(frequencyWeeks) || 1) : 1,
        specialists: roleType === "SPECIALIST" && specialistUserIds?.length
          ? { create: specialistUserIds.map((userId: string) => ({ userId })) }
          : undefined,
      },
      include: {
        assignedUser: { select: { id: true, name: true } },
        specialists: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json(role);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists for this team" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.dutyRole.delete({ where: { id: params.roleId } });
  return NextResponse.json({ success: true });
}
