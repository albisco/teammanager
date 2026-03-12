import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamDutyRoles = await prisma.teamDutyRole.findMany({
    where: { teamId: params.id },
    include: {
      dutyRole: true,
      assignedUser: { select: { id: true, name: true } },
      specialists: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { dutyRole: { roleName: "asc" } },
  });

  return NextResponse.json(teamDutyRoles);
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
    // Find or create the global duty role
    let dutyRole = await prisma.dutyRole.findUnique({ where: { roleName } });
    if (!dutyRole) {
      dutyRole = await prisma.dutyRole.create({ data: { roleName } });
    }

    const teamDutyRole = await prisma.teamDutyRole.create({
      data: {
        teamId: params.id,
        dutyRoleId: dutyRole.id,
        roleType,
        assignedUserId: roleType === "FIXED" ? assignedUserId : null,
        frequencyWeeks: roleType === "FREQUENCY" ? (parseInt(frequencyWeeks) || 1) : 1,
        specialists: roleType === "SPECIALIST" && specialistUserIds?.length
          ? { create: specialistUserIds.map((userId: string) => ({ userId })) }
          : undefined,
      },
      include: {
        dutyRole: true,
        assignedUser: { select: { id: true, name: true } },
        specialists: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json(teamDutyRole, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This role is already assigned to this team" }, { status: 409 });
    }
    throw err;
  }
}
