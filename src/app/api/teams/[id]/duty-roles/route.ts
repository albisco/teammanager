import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await prisma.dutyRole.findMany({
    where: { teamId: params.id },
    include: {
      assignedUser: { select: { id: true, name: true } },
      specialists: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { roleName: "asc" },
  });

  return NextResponse.json(roles);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { roleName, roleType, assignedUserId, frequencyWeeks, specialistUserIds } = body;

  if (!roleName || !roleType) {
    return NextResponse.json({ error: "Role name and type are required" }, { status: 400 });
  }

  try {
    const role = await prisma.dutyRole.create({
      data: {
        teamId: params.id,
        roleName,
        roleType,
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

    return NextResponse.json(role, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists for this team" }, { status: 409 });
    }
    throw err;
  }
}
